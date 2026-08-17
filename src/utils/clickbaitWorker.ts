/**
 * In-browser clickbait inference worker.
 *
 * Runs the distilled XLM-R model (github.com/HappyWalkers/bilibili-cleaner,
 * model-based-clickbait-filter branch) entirely client-side via transformers.js,
 * so scoring has no dependency on a local server. Model + ONNX Runtime Web's WASM
 * binaries are both self-hosted on the same HF repo -- not a third-party CDN we
 * don't control -- and cached by the browser after first fetch (Cache API/IndexedDB,
 * handled internally by transformers.js).
 *
 * fp32, unquantized by design: full precision over download size/speed. See the
 * model card at https://huggingface.co/Penn1357/bilibili-clickbait-xlmr for the
 * accuracy/latency tradeoff this implies.
 */
import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers'

const MODEL_ID = 'Penn1357/bilibili-clickbait-xlmr'
const MAX_LENGTH = 64

// NOT setting env.backends.onnx.wasm.wasmPaths: vite's own asset pipeline already
// bundles onnxruntime-web's WASM binary directly into this file (it resolves
// onnxruntime-web's internal `new URL(..., import.meta.url)` reference at build
// time and inlines it as a data: URL -- confirmed in the built output). That
// embedded copy works with zero runtime network dependency for the WASM runtime
// itself, which is a *better* fit for "not dependent on a host we don't control"
// than a live fetch would be. Pointing wasmPaths at a self-hosted HF `wasm/`
// folder was tried and failed: HF Hub's `resolve/main/` serving doesn't set a
// MIME type dynamic `import()` accepts for the `.mjs` loader (plain fetch of the
// model/tokenizer files is unaffected -- this is specific to module-script
// fetching). Not worth chasing further given the embedded path already works.

type ScoreRequest = { type: 'score'; id: number; titles: string[] }
type Incoming = ScoreRequest

type Progress = { status: string; file?: string; progress?: number; loaded?: number; total?: number }
type ScoreResult = { type: 'result'; id: number; scores: number[] }
type ScoreError = { type: 'error'; id: number; message: string }
type ProgressMsg = { type: 'progress'; data: Progress }
type Outgoing = ScoreResult | ScoreError | ProgressMsg

const post = (msg: Outgoing) => (self as unknown as Worker).postMessage(msg)

let ready: Promise<{ tok: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; model: Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>> }> | undefined

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x))
}

/** transformers.js fires progress_callback per network chunk -- for a 1.1GB file
 * that's thousands of events/sec, enough to flood the main thread's message
 * queue and hang the page if forwarded unthrottled (observed directly while
 * testing this worker standalone). Time-box it; always let 'done'/'ready'
 * through so a progress UI's final state is never dropped. */
function throttledProgress(post: (p: Progress) => void, minIntervalMs = 200) {
    let last = 0
    return (data: Progress) => {
        const now = Date.now()
        const isFinal = data.status === 'done' || data.status === 'ready'
        if (isFinal || now - last >= minIntervalMs) {
            last = now
            post(data)
        }
    }
}

function load() {
    if (!ready) {
        ready = (async () => {
            const progress_callback = throttledProgress((data) => post({ type: 'progress', data }))
            const [tok, model] = await Promise.all([
                AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
                AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
                    dtype: 'fp32',
                    device: 'wasm',
                    progress_callback,
                }),
            ])
            return { tok, model }
        })()
    }
    return ready
}

async function score(titles: string[]): Promise<number[]> {
    const { tok, model } = await load()
    const inputs = await tok(titles, { padding: true, truncation: true, max_length: MAX_LENGTH })
    const output = await model(inputs)
    // Single-logit sigmoid regressor (num_labels=1), same head shape as server/scorer.py --
    // NOT a softmax classifier. Getting this branch wrong is the exact bug that was already
    // caught once in the Python server (softmax over a size-1 dim always returns 1.0).
    const logits = output.logits.tolist() as number[][]
    return logits.map((row) => sigmoid(row[0]))
}

self.onmessage = async (ev: MessageEvent<Incoming>) => {
    const msg = ev.data
    if (msg.type !== 'score') return
    try {
        const scores = await score(msg.titles)
        post({ type: 'result', id: msg.id, scores })
    } catch (err) {
        post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
    }
}
