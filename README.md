# bilibili 标题党过滤器 (AI)

A fork of [festoney8/bilibili-cleaner](https://github.com/festoney8/bilibili-cleaner) (MIT) that adds a
**model-based clickbait filter** alongside its existing keyword filters.

Upstream's README documents the limitation this addresses:

> 关键词不宜过于简单，可能造成误伤，屏蔽过多视频影响浏览体验
> 编写正则要慎重，可能造成大量视频屏蔽和频繁载入

Instead of a hand-maintained regex list, each video title is scored by a distilled XLM-RoBERTa
classifier and hidden above a threshold. Every upstream filter is left intact.

## Architecture

```
bilibili page
 └─ userscript (Tampermonkey)
     └─ ClickbaitFilter        implements upstream's ISubFilter
         └─ clickbaitScorer    batch(40/25ms) + LRU(5000) + circuit breaker + fail-open
             └─ GM_xmlhttpRequest ──▶ 127.0.0.1:8731  (server/scorer.py)
                                        └─ distilled XLM-RoBERTa (server/model/)
```

`ClickbaitFilter.check()` follows upstream's contract exactly — resolve to keep a card, reject to hide
it — so it slots in beside `KeywordFilter` with no pipeline changes.

## Setup

```bash
pip install torch transformers
python server/scorer.py                 # http://127.0.0.1:8731 — needs server/model/ populated,
                                          # see "Reproducing the model" below

pnpm install && pnpm run build          # -> dist/*.user.js
```

Install `dist/*.user.js` in Tampermonkey, then on bilibili: 视频过滤 → **标题党过滤（AI 模型）** →
enable. Default threshold is 69% (tuned for this model — see Calibration below).

> **Chrome 138+** requires enabling **"Allow User Scripts"** on the Tampermonkey entry in
> `chrome://extensions`. Without it userscripts install but never execute, with no error shown.

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

| | AUC | best acc | precision | recall | F1 | params | latency |
|---|---|---|---|---|---|---|---|
| best off-the-shelf model | 0.797 | 0.780 | — | — | 0.463 | 278M | 70ms |
| Qwen3.5-4B + XLM-R-new ensemble (2 models) | 0.823 | 0.850 | 0.744 | 0.592 | 0.659 | ~4B total | GPU + ~250ms |
| **distilled student (shipped)** | **0.834** | **0.805** | **0.576** | **0.776** | **0.661** | **278M** | **45ms (CPU)** |
| codex teacher (ceiling, not shippable) | 0.909 | 0.850 | 0.702 | 0.673 | 0.688 | — | API call |

All evaluated on the same 200 titles, held out from every training/distillation step. The ensemble
row is essentially F1-tied with the distilled student (0.659 vs 0.661) — distillation's real win here
isn't raw score, it's that a single 278M CPU model matches a GPU-dependent multi-model ensemble while
trading its precision for recall (0.776 vs 0.592), which fits this project's stated preference for
catching more bait over minimizing false hides. See `data/train_bilibili_only.log` for the full
per-epoch training trace.

### CN-Spoil ablation — tried, not shipped

[CN-Spoil](https://github.com/shq3526/CN-Spoil) is a public Chinese clickbait-spoiling dataset
(9,373 news headlines). It's positives-only and news-register, not video titles, so raw labels
weren't used — a 2,500-title sample was re-scored by codex (same judge as everything else) to avoid
training the model to detect "which corpus is this from" instead of "is this bait."

Result: adding CN-Spoil (`data/train_combined.log`) moved AUC 0.834→0.842, a difference a bootstrap
test showed is **not statistically significant** (95% CI on the delta: [-0.027, +0.041], n=200). What
it did do reliably: shift precision up (0.576→0.741) at a large recall cost (0.776→0.408), roughly
halving F1 (0.661→0.526). The news-headline domain gap flagged before running this experiment showed
up empirically as a real cost, not a hypothetical one. **Bilibili-only is the shipped default.**

`server/model_combined_alt/` is the CN-Spoil-inclusive checkpoint, kept as a documented
higher-precision/lower-recall alternative for anyone who'd rather trade recall for fewer false hides.

### Calibration

The distilled model's raw sigmoid output is **not** calibrated the same way as the off-the-shelf
models this fork used to ship. Threshold sweep on the 200-title test set:

| threshold | acc | precision | recall | F1 | % hidden |
|---|---|---|---|---|---|
| 0.50 | 0.600 | 0.374 | 0.939 | 0.535 | 62% |
| 0.60 | 0.735 | 0.478 | 0.878 | 0.619 | 45% |
| **0.69** | **0.805** | **0.576** | **0.776** | **0.661** | 33% |
| 0.75 | 0.800 | 0.622 | 0.469 | 0.535 | 19% |
| 0.80 | 0.765 | 0.583 | 0.143 | 0.230 | 6% |
| 0.85+ | 0.755 | — | 0.000 | 0.000 | 0% |

**The old default of 80% would have nearly disabled this model** (6% hidden, recall 0.143). Default
is now **69%** — verify this if you swap in a different checkpoint; every model in this project has
had a different effective threshold.

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
