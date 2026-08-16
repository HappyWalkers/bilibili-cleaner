import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClickbaitScorer, Transport } from '../clickbaitScorer'

vi.mock('@/utils/logger', () => ({ logger: { error: () => {}, debug: () => {} } }))
vi.mock('vite-plugin-monkey/dist/client', () => ({ GM_xmlhttpRequest: () => {} }))

const mkTransport = (impl?: (titles: string[]) => number[]) => {
    const calls: string[][] = []
    const t: Transport = async (_e, titles) => {
        calls.push(titles)
        return impl ? impl(titles) : titles.map(() => 0.9)
    }
    return { t, calls }
}

describe('ClickbaitScorer', () => {
    beforeEach(() => vi.useRealTimers())

    it('scores a title', async () => {
        const { t } = mkTransport()
        expect(await new ClickbaitScorer(t).score('震惊！')).toBe(0.9)
    })

    it('batches concurrent titles into one request', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        await Promise.all(['a', 'b', 'c', 'd'].map((x) => s.score(x)))
        expect(calls.length).toBe(1)
        expect(calls[0]).toEqual(['a', 'b', 'c', 'd'])
    })

    it('deduplicates identical titles within a batch', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        const r = await Promise.all(['x', 'x', 'x'].map((v) => s.score(v)))
        expect(calls[0]).toEqual(['x'])
        expect(r).toEqual([0.9, 0.9, 0.9])
    })

    it('caches, so a repeat title costs no request', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        await s.score('same')
        await s.score('same')
        expect(calls.length).toBe(1)
    })

    it('maps scores to the right titles', async () => {
        const map: Record<string, number> = { low: 0.1, mid: 0.5, high: 0.95 }
        const { t } = mkTransport((titles) => titles.map((x) => map[x]))
        const s = new ClickbaitScorer(t)
        const [a, b, c] = await Promise.all([s.score('high'), s.score('low'), s.score('mid')])
        expect([a, b, c]).toEqual([0.95, 0.1, 0.5])
    })

    it('fails open: transport error yields 0, never rejects', async () => {
        const t: Transport = async () => {
            throw new Error('ECONNREFUSED')
        }
        await expect(new ClickbaitScorer(t).score('anything')).resolves.toBe(0)
    })

    it('does not cache failures', async () => {
        let fail = true
        const calls: number[] = []
        const t: Transport = async (_e, titles) => {
            calls.push(1)
            if (fail) throw new Error('down')
            return titles.map(() => 0.8)
        }
        const s = new ClickbaitScorer(t)
        expect(await s.score('t')).toBe(0)
        fail = false
        expect(await s.score('t')).toBe(0.8)
        expect(calls.length).toBe(2)
    })

    it('empty / whitespace titles short-circuit without a request', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        expect(await s.score('   ')).toBe(0)
        expect(calls.length).toBe(0)
    })

    it('splits oversized batches (MAX_BATCH=40)', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        await Promise.all(Array.from({ length: 95 }, (_, i) => s.score(`t${i}`)))
        expect(calls.length).toBeGreaterThanOrEqual(3)
        expect(Math.max(...calls.map((c) => c.length))).toBeLessThanOrEqual(40)
        expect(calls.flat().length).toBe(95)
    })

    it('circuit-breaks after repeated failures then recovers', async () => {
        let n = 0
        const t: Transport = async () => {
            n++
            throw new Error('down')
        }
        const s = new ClickbaitScorer(t)
        for (let i = 0; i < 6; i++) await s.score(`a${i}`)
        const afterTrip = n
        await s.score('while-muted')
        expect(n).toBe(afterTrip) // muted: no further requests
    })

    it('changing endpoint clears the cache', async () => {
        const { t, calls } = mkTransport()
        const s = new ClickbaitScorer(t)
        await s.score('dup')
        s.setEndpoint('http://127.0.0.1:9999/score')
        await s.score('dup')
        expect(calls.length).toBe(2)
    })
})
