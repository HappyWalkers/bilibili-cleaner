import { logger } from '@/utils/logger'
import { workerTransport } from './clickbaitWorkerTransport'

/**
 * Clickbait scoring client.
 *
 * Talks to the local scorer service (server/scorer.py) over GM_xmlhttpRequest,
 * which bypasses page CORS. Titles are micro-batched so a feed of 30 cards costs
 * one request instead of 30, and results are LRU-cached because bilibili
 * re-renders the same cards constantly during virtual scrolling.
 *
 * Fails open: if the service is unreachable, every title scores 0 so nothing is
 * hidden. A dead backend must never blank the feed.
 */

const BATCH_WINDOW_MS = 25
const MAX_BATCH = 40
const CACHE_SIZE = 5000
const REQUEST_TIMEOUT_MS = 8000

type Pending = { title: string; resolve: (v: number) => void }

/** Injectable transport so the batching/caching logic is testable without GM APIs. */
export type Transport = (endpoint: string, titles: string[]) => Promise<number[]>

/** GM_xmlhttpRequest -> local server (server/scorer.py). Kept for local dev/eval
 * parity checks against the in-browser path; no longer the default.
 *
 * Dynamic import, not a top-level one: 'vite-plugin-monkey/dist/client' references
 * `__MONKEY_WINDOW_KEY__`, a global vite-plugin-monkey's own Vite plugin defines at build time --
 * absent from the extension build (no monkey() plugin there), so a top-level import crashed the
 * whole isolated-world bundle at load time even though gmTransport itself is never called in
 * production (workerTransport is the default, below). Deferring to call time means this only
 * matters if someone actually wires gmTransport in for local dev. */
export const gmTransport: Transport = (endpoint, titles) =>
    new Promise<number[]>((resolve, reject) => {
        import('vite-plugin-monkey/dist/client').then(({ GM_xmlhttpRequest }) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ titles }),
                timeout: REQUEST_TIMEOUT_MS,
                onload: (res) => {
                    try {
                        if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
                        const scores = JSON.parse(res.responseText)?.scores
                        if (!Array.isArray(scores) || scores.length !== titles.length) {
                            throw new Error('bad response shape')
                        }
                        resolve(scores)
                    } catch (err) {
                        reject(err)
                    }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error('timeout')),
            })
        })
    })

export class ClickbaitScorer {
    constructor(private transport: Transport = gmTransport) {}

    private endpoint = 'http://127.0.0.1:8731/score'
    private cache = new Map<string, number>()
    private inflight = new Map<string, Promise<number>>()
    private queue: Pending[] = []
    private timer: ReturnType<typeof setTimeout> | undefined
    private failures = 0
    private mutedUntil = 0

    setEndpoint(url: string): void {
        if (url && url !== this.endpoint) {
            this.endpoint = url
            this.cache.clear()
        }
    }

    getEndpoint(): string {
        return this.endpoint
    }

    clearCache(): void {
        this.cache.clear()
    }

    private cacheGet(t: string): number | undefined {
        const v = this.cache.get(t)
        if (v !== undefined) {
            this.cache.delete(t) // LRU touch
            this.cache.set(t, v)
        }
        return v
    }

    private cacheSet(t: string, v: number): void {
        this.cache.set(t, v)
        if (this.cache.size > CACHE_SIZE) {
            const oldest = this.cache.keys().next().value
            if (oldest !== undefined) this.cache.delete(oldest)
        }
    }

    /** Score one title in [0,1]. Never rejects. */
    score(title: string): Promise<number> {
        const t = title.trim()
        if (!t) return Promise.resolve(0)

        const hit = this.cacheGet(t)
        if (hit !== undefined) return Promise.resolve(hit)

        // circuit breaker: after repeated failures, stop hammering a dead server
        if (Date.now() < this.mutedUntil) return Promise.resolve(0)

        const dup = this.inflight.get(t)
        if (dup) return dup

        const p = new Promise<number>((resolve) => {
            this.queue.push({ title: t, resolve })
            if (this.queue.length >= MAX_BATCH) {
                this.flush()
            } else if (this.timer === undefined) {
                this.timer = setTimeout(() => this.flush(), BATCH_WINDOW_MS)
            }
        })
        this.inflight.set(t, p)
        return p
    }

    private flush(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer)
            this.timer = undefined
        }
        const batch = this.queue.splice(0, MAX_BATCH)
        if (!batch.length) return

        // one entry per distinct title, but resolve every waiter for it
        const order: string[] = []
        const waiters = new Map<string, ((v: number) => void)[]>()
        for (const { title, resolve } of batch) {
            const list = waiters.get(title)
            if (list) {
                list.push(resolve)
            } else {
                waiters.set(title, [resolve])
                order.push(title)
            }
        }

        const settle = (scores: number[] | null) => {
            order.forEach((title, i) => {
                const v = scores && typeof scores[i] === 'number' ? scores[i] : 0
                if (scores) this.cacheSet(title, v)
                waiters.get(title)?.forEach((r) => r(v))
                this.inflight.delete(title)
            })
            if (this.queue.length) this.flush()
        }

        this.transport(this.endpoint, order)
            .then((scores) => {
                this.failures = 0
                settle(scores)
            })
            .catch((err) => {
                this.onFailure(err)
                settle(null)
            })
    }

    private onFailure(err: unknown): void {
        this.failures++
        if (this.failures === 1 || this.failures % 20 === 0) {
            logger.error(`clickbait scorer unreachable (${this.endpoint})`, err)
        }
        if (this.failures >= 5) {
            this.mutedUntil = Date.now() + 30_000
            this.failures = 0
        }
    }
}

// In-browser inference by default -- see clickbaitWorkerTransport.ts. gmTransport
// (this file, above) is the fallback for local dev against server/scorer.py.
export const clickbaitScorer = new ClickbaitScorer(workerTransport)
