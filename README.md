# bilibili 标题党过滤器 (AI)

A fork of [festoney8/bilibili-cleaner](https://github.com/festoney8/bilibili-cleaner) (MIT) that adds a
**model-based clickbait filter** alongside its existing keyword filters.

Upstream's README documents the limitation this addresses:

> 关键词不宜过于简单，可能造成误伤，屏蔽过多视频影响浏览体验
> 编写正则要慎重，可能造成大量视频屏蔽和频繁载入

Instead of a hand-maintained regex list, each video title is scored by a distilled XLM-RoBERTa
classifier and hidden above a threshold. Every upstream filter is left intact.

## Architecture

As of v2.0.0, scoring runs **entirely client-side** — no local server needed. This is what makes
the userscript actually publishable (GreasyFork, eventually); v1.x's `GM_xmlhttpRequest` ->
local Python server design couldn't ship to anyone but its own developer.

```
bilibili page
 └─ userscript (Tampermonkey)
     └─ ClickbaitFilter        implements upstream's ISubFilter
         └─ clickbaitScorer    batch(40/25ms) + LRU(5000) + circuit breaker + fail-open
             └─ workerTransport ──▶ Web Worker (bundled, vite `?worker&inline`)
                                       └─ transformers.js (@huggingface/transformers)
                                            ├─ ONNX Runtime Web, WASM backend
                                            │  (embedded in the built script -- vite auto-bundles
                                            │   onnxruntime-web's own `import.meta.url` wasm
                                            │   reference; this is *more* self-contained than a
                                            │   live fetch, not less, and was chosen after a
                                            │   self-hosted-on-HF alternative failed -- see below)
                                            └─ Penn1357/bilibili-clickbait-xlmr (HF Hub, fp32,
                                               unquantized, ~1.1GB, fetched once and cached by
                                               the browser -- Cache API, handled internally by
                                               transformers.js)
```

`ClickbaitFilter.check()` and `clickbaitScorer`'s batching/caching/circuit-breaker are unchanged
from v1.x — only the `Transport` underneath swapped (the seam that abstraction was built for).
`gmTransport` (→ `server/scorer.py`) is kept for local dev/training-parity checks, just no longer
the default; `workerTransport` (`src/utils/clickbaitWorkerTransport.ts`) is.

**Verified, not assumed**: the in-browser path was tested standalone (esbuild-bundled worker,
loaded as a real `Worker` in a browser tab, scored against the full 200-title human-labeled test)
before being wired into the userscript build. In-browser AUC: **0.8651**, vs. 0.8651 for the
Python ONNX export and 0.865 for the original PyTorch model — per-title score differences topped
out at 1.4e-6, floating-point noise, not a real discrepancy.

**A design choice that didn't survive contact with reality**: the original plan was to
self-host ONNX Runtime's WASM runtime on the same HF repo (`wasm/` folder, still there, currently
unused) and point `env.backends.onnx.wasm.wasmPaths` at it explicitly, to avoid depending on a
third-party CDN. That failed — HF Hub's `resolve/main/` file serving doesn't set a MIME type
dynamic `import()` accepts for the `.mjs` loader specifically (plain `fetch()` of the model/
tokenizer files is unaffected). Fix: don't set `wasmPaths` at all. Vite's own build already
resolves onnxruntime-web's internal `new URL(..., import.meta.url)` wasm reference and inlines it
as a `data:` URL directly into the built script — which turned out to be a *better* fit for "not
dependent on a host we don't control" than the original self-hosting plan, not a worse one.

**Real, measured cost of "no quantization"**: fp32 WASM inference measured ~485ms/title (30-title
warm batch, model already cached) vs. ~44ms/title for the old native PyTorch server. That's the
direct, accepted tradeoff of full precision over speed — not a bug, a choice, now with real numbers
attached instead of a prediction.

**GPU via WebGPU, since v2.1.0**: `device: 'auto'` (was `'wasm'`) lets transformers.js try
WebGPU first and fall back to WASM automatically when it's unavailable — no code branching needed,
this is built into the library. Real measured result on an RTX 5060 laptop GPU: a cold, fresh
20-title batch (fresh Worker, empty cache, first load after navigation) fully scored and filtered
in **~602ms** (~30ms/title end-to-end, including tokenization and batching overhead) — roughly
15x+ faster than the fp32-WASM baseline above. Falls back to WASM cleanly and correctly on
machines without a usable WebGPU adapter (verified directly: old GPUs, disabled hardware
acceleration, driver blocklists). One Linux-specific note from testing: some hybrid-graphics laptop
setups (integrated + discrete GPU) have Vulkan disabled by Chrome's own driver-bug-list by default,
which blocks WebGPU down to CPU software emulation (SwiftShader) — `chrome://flags` doesn't have a
toggle for this, but launching Chrome with `--enable-features=Vulkan` fixed it in testing. Most
users won't need this; it's specific to that class of Linux setup.

## Install

**Easiest**: [download the built script from the latest release](https://github.com/HappyWalkers/bilibili-cleaner/releases/tag/clickbait-v2.1.0) and open it -- Tampermonkey will offer to install directly. No build tools needed.

**From source** (for development, or to audit before installing):

```bash
pnpm install && pnpm run build          # -> dist/*.user.js (~65MB -- the built script embeds
                                          #    transformers.js + the ONNX runtime; the 1.1GB model
                                          #    itself is fetched at runtime, not bundled)
```

Install `dist/*.user.js` in Tampermonkey, then on bilibili: 视频过滤 → **标题党过滤（AI 模型）** →
enable. First use downloads the model (~1.1GB, one-time, cached by the browser afterward). Default
threshold is 68% (tuned for this model — see Calibration below).

> **Chrome 138+** requires enabling **"Allow User Scripts"** on the Tampermonkey entry in
> `chrome://extensions`. Without it userscripts install but never execute, with no error shown.

### Local-server mode (dev only)

```bash
pip install torch transformers
python server/scorer.py                 # http://127.0.0.1:8731 — needs server/model/ populated,
                                          # see "Reproducing the model" below
```

Swap `clickbaitScorer`'s constructor argument from `workerTransport` to `gmTransport` in
`src/utils/clickbaitScorer.ts` to use this instead — useful for testing a new checkpoint before
going through a full ONNX export + HF upload cycle.

## The model

`server/model/` is **not** an off-the-shelf classifier — it's distilled from an LLM teacher on
bilibili-specific data. Short version of how it got here:

1. **Benchmarked 22 open clickbait models** (English-trained BERT/RoBERTa variants, several
   multilingual XLM-R/mBERT fine-tunes) on 200 hand-labeled bilibili titles. Every English-only
   backbone scored at chance (AUC 0.52-0.62) on Chinese titles — cross-lingual transfer requires a
   multilingual backbone, and even then only some fine-tunes transferred (AUC 0.68-0.80).
2. **Tested an ensemble** of the best local models (Qwen3.5-4B + 2 XLM-R variants): AUC 0.823.
3. **Tested an LLM teacher** (codex / gpt-5.6-sol) on the same 200 titles: **AUC 0.909** — a clear
   step up, and the reason the ensemble was dropped as the distillation teacher.
4. **Scraped ~3,126 bilibili titles** (ranking + popular + per-category newlist APIs, deduped, with
   zero overlap against the 200-title test set — enforced by `data/check_leakage.py`) and had codex
   score each one 0-100 as a soft clickbait label.
5. **Fine-tuned XLM-R-base** (`FacebookAI/xlm-roberta-base`, single-logit sigmoid regression head,
   BCE loss on the soft labels) on those distilled labels. Checkpoint selected by validation loss
   across 6 epochs — **not** by test-set AUC, to avoid peeking.

### Result

Three generations of this model have been trained; each is kept as a labeled alternative so the
comparisons are reproducible, not just asserted.

| | AUC | best acc | precision | recall | F1 | training data | teacher |
|---|---|---|---|---|---|---|---|
| best off-the-shelf model | 0.797 | 0.780 | — | — | 0.463 | (pretrained, no distillation) | — |
| Qwen3.5-4B + XLM-R-new ensemble | 0.823 | 0.850 | 0.744 | 0.592 | 0.659 | — | — (not a distilled model) |
| gen 1 (`server/model_codex_only_3k_alt/`) | 0.834 | 0.805 | 0.576 | 0.776 | 0.661 | 3,126 bilibili titles | codex alone (AUC 0.909) |
| gen 2, +7.5k more data (not kept) | 0.849 | 0.830 | 0.742 | 0.469 | 0.575 | 10,684 bilibili titles | codex alone |
| **gen 3 (shipped, `server/model/`)** | **0.865** | **0.845** | **0.647** | **0.673** | **0.660** | **10,684 bilibili titles** | **codex+agy average (AUC 0.930)** |
| codex teacher alone (ceiling) | 0.909 | 0.850 | 0.702 | 0.673 | 0.688 | — | — |
| codex+agy average (ceiling) | 0.930 | — | — | — | — | — | — |

All evaluated on the same 200 titles, held out from every training/distillation step, at each model's
own best-F1 threshold from a sweep on that set. See `data/train_dual_teacher.log` for the full
per-epoch trace of the shipped model.

**The lesson two ablations in a row got wrong, then one got right:** scaling raw training data 3.4x
under a single-teacher signal (gen 1 -> gen 2) produced a gain the same size as noise (95% CI on the
AUC delta: [-0.022, +0.050]) -- more of the same data, same label quality, hits a ceiling. Scaling
*teacher quality* instead (gen 2 -> gen 3, same 10,684 titles, codex+agy averaged instead of codex
alone) produced a bigger gain (+0.031 AUC) that held across every one of 6 training epochs, not just
one lucky checkpoint -- gen 2's per-epoch AUC bounced across a wide 0.835-0.855 band epoch to epoch,
gen 3's sat in a consistently higher, tighter 0.846-0.873 band. That consistency is itself evidence,
independent of the point estimate. The bootstrap CI on gen3-vs-gen1 ([-0.009, +0.068]) still technically
crosses zero at strict 95% -- this project's 200-title test set cannot cleanly resolve effects this
size, which is a limitation of the *evaluation*, not grounds to dismiss the result.

`codex` (OpenAI, gpt-5.6-sol via the `codex` CLI) and `agy` (Google Gemini 3.1 Pro via the `agy` CLI)
were validated independently before either was trusted as a teacher, same as every model in this
project -- scored on the 200-title test first (AUC 0.909 and 0.913 respectively), *then* used for
bulk labeling. Their pairwise correlation on that test is 0.81 (Pearson) -- high, but not so high that
averaging them is redundant, which is exactly why it helped.

### CN-Spoil ablation — tried, not shipped

[CN-Spoil](https://github.com/shq3526/CN-Spoil) is a public Chinese clickbait-spoiling dataset
(9,373 news headlines). It's positives-only and news-register, not video titles, so raw labels
weren't used — a 2,500-title sample was re-scored by codex (same judge as everything else) to avoid
training the model to detect "which corpus is this from" instead of "is this bait."

Result: adding CN-Spoil (`data/train_combined.log`) moved AUC 0.834→0.842, not statistically
significant (95% CI: [-0.027, +0.041], n=200). Reliable effect: precision up (0.576→0.741), recall
cut hard (0.776→0.408), F1 roughly halved. The news-headline domain gap flagged before running this
showed up as a real cost. Not shipped.

`server/model_combined_alt/` is the CN-Spoil-inclusive checkpoint, kept as a documented
higher-precision/lower-recall alternative for anyone who'd rather trade recall for fewer false hides.

### Calibration

Every generation of this model has landed at a different effective threshold — recalibrate whenever
you swap the checkpoint, never assume a default carries over. Sweep for the shipped gen-3 model:

| threshold | acc | precision | recall | F1 | % hidden |
|---|---|---|---|---|---|
| 0.55 | 0.705 | 0.444 | 0.816 | 0.576 | 41% |
| 0.62 | 0.775 | 0.529 | 0.755 | 0.622 | 27% |
| **0.68** | **0.835** | **0.648** | **0.714** | **0.680** | 22% |
| 0.69 (unchanged from gen 1's default) | 0.830 | 0.647 | 0.673 | 0.660 | 21% |
| 0.73 | 0.840 | 0.707 | 0.592 | 0.644 | 15% |

0.68 is the true peak by a narrow margin — the default was moved there from gen 1's 0.69. The gap
between them is small enough that either is defensible; 0.68 is shipped because it's free (already
measured) and marginally better.

### Honest limits

- **All labels trace back to codex's judgment**, itself validated against 200 titles labeled by a
  single human annotator (project author). Neither is ground truth. A second independent human
  annotator would be the single highest-value next step for trusting these numbers.
- **False positives are systematic, not random**: the model over-fires on legitimate content with
  sensational surface register — superlatives, exclamation marks, dramatic question-hooks (e.g. a
  military-spec explainer titled with "世界军事史上最昂贵的项目是什么？" gets flagged despite being
  informative). It has learned "sensational rhetoric" as a strong proxy for bait, which is mostly
  right but predictably wrong on enthusiastic-but-honest content.
- **False negatives cluster on subtle/stylistic bait**: spaced-out meme formatting (`大 家 一 起 找
  小 三`) and pure emotional quote-hooks with no sensational vocabulary are the hardest category —
  consistent across every method tried in this project (NLI zero-shot, off-the-shelf classifiers,
  LLMs, and now this distilled model).
- **Training pool skews toward front-page/trending content** (ranking + popular + newlist APIs), not
  personalized recommendations. An attempt to broaden this via bilibili's search API was blocked by
  anti-crawler risk control (HTTP 412, then account-wide rate-limit code -352 on every endpoint) and
  abandoned rather than pushed through unsupervised — see `data/scrape_pool.py`'s comments.

## Reproducing the model

```bash
cd data
python3 check_leakage.py          # verify pool.jsonl has zero overlap with the test set
./run_ablation.sh                 # trains both arms, prints final comparison
# outputs: student_model_bilibili_only/, student_model_combined/
```

Needs a CUDA GPU (fine-tuning ran on an RTX 5060 laptop GPU; both arms together take a few minutes).
`codex_pool.json` / `codex_cnspoil.json` are the already-collected teacher labels — re-labeling from
scratch needs the `codex` CLI (or swap in another LLM) and re-running `score_codex.py`, which is the
slow, costly step (~60-90 min for the full pool via the OpenAI-backed codex CLI, batched at 50
titles/call).

## Behaviour

- **Fails open** — if the scorer is unreachable every title scores 0 and nothing is hidden.
- **Circuit breaker** — 5 consecutive failures mutes requests for 30s.
- **Batched** — ≤40 titles/request, 25ms coalescing; a 30-card feed is one round trip.
- **Cached** — 5000-entry LRU client-side, 20000 server-side.

## Testing note: requestAnimationFrame and hidden tabs

Upstream writes all hide/visit attributes inside a `requestAnimationFrame` callback. **Chrome pauses
rAF in hidden/backgrounded tabs**, so under headless/automated browser control the filter runs
correctly, computes the right hits, and then silently drops every DOM write. It looks exactly like a
broken filter. If you are testing this programmatically, assert on `document.visibilityState` first.

## Tests

```bash
npx vitest run                        # 11 client tests: batching, dedup, cache, fail-open, breaker
python server/tests/test_scorer.py    # service: API, edge cases, accuracy regression (AUC >= 0.72)
```

`server/tests/data200.py` holds the 200 held-out human-labeled titles used as the accuracy fixture —
never used in training, at any step.

## License

MIT, inherited from upstream. Upstream README preserved as `README.upstream.md`.
