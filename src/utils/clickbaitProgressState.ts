import { reactive } from 'vue'

export type WorkerProgress = { status: string; file?: string; progress?: number; loaded?: number; total?: number }

/**
 * Live model-load status for the settings panel. Read by ProgressComp.vue,
 * written by clickbaitWorkerTransport.ts's onWorkerProgress hook.
 *
 * transformers.js's `progress_total` events already aggregate across every
 * file being fetched (tokenizer + config + the 1.1GB onnx weights), so we
 * key off that alone rather than tracking per-file state ourselves.
 */
export type ProgressPhase = 'idle' | 'loading' | 'ready' | 'error'

export const clickbaitProgress = reactive({
    phase: 'idle' as ProgressPhase,
    percent: 0,
    loadedMB: 0,
    totalMB: 0,
    errorMessage: '',
})

export function applyWorkerProgress(data: WorkerProgress): void {
    if (data.status === 'progress_total' && typeof data.progress === 'number') {
        clickbaitProgress.phase = 'loading'
        clickbaitProgress.percent = Math.min(100, Math.round(data.progress))
        clickbaitProgress.loadedMB = Math.round((data.loaded ?? 0) / 1e6)
        clickbaitProgress.totalMB = Math.round((data.total ?? 0) / 1e6)
    } else if (data.status === 'ready') {
        clickbaitProgress.phase = 'ready'
        clickbaitProgress.percent = 100
    }
}

export function markScorerError(message: string): void {
    clickbaitProgress.phase = 'error'
    clickbaitProgress.errorMessage = message
}
