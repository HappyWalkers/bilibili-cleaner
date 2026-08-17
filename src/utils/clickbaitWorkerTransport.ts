import { logger } from '@/utils/logger'
import type { Transport } from './clickbaitScorer'
// eslint-disable-next-line import/no-unresolved
import InferenceWorker from './clickbaitWorker?worker&inline'

/**
 * In-browser Transport: routes scoring through clickbaitWorker.ts instead of
 * GM_xmlhttpRequest to a local server. Bundled + inlined as a data: URL via vite's
 * `?worker&inline` (vite-plugin-monkey emits a single userscript file, so there's
 * no separate served path a normal `?worker` chunk could live at).
 *
 * One worker, lazily created on first use and reused for the page's lifetime --
 * model load (~1.1GB, fp32, unquantized) happens once inside it, not per call.
 */

export type WorkerProgress = { status: string; file?: string; progress?: number; loaded?: number; total?: number }
export const onWorkerProgress: { current: ((p: WorkerProgress) => void) | undefined } = { current: undefined }

let worker: Worker | undefined
let nextId = 1
const pending = new Map<number, { resolve: (v: number[]) => void; reject: (e: unknown) => void }>()

function getWorker(): Worker {
    if (worker) return worker
    worker = new InferenceWorker()
    worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data
        if (msg.type === 'progress') {
            onWorkerProgress.current?.(msg.data)
            return
        }
        const waiter = pending.get(msg.id)
        if (!waiter) return
        pending.delete(msg.id)
        if (msg.type === 'result') waiter.resolve(msg.scores)
        else waiter.reject(new Error(msg.message))
    }
    worker.onerror = (ev: ErrorEvent) => {
        logger.error('clickbait inference worker crashed', ev.message)
        // fail every in-flight request open rather than hang forever
        for (const [id, w] of pending) {
            w.reject(new Error('worker crashed'))
            pending.delete(id)
        }
        worker = undefined // next call gets a fresh worker
    }
    return worker
}

export const workerTransport: Transport = (_endpoint, titles) =>
    new Promise<number[]>((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        getWorker().postMessage({ type: 'score', id, titles })
    })
