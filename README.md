# bilibili 标题党过滤器 (AI)

A fork of [festoney8/bilibili-cleaner](https://github.com/festoney8/bilibili-cleaner) (MIT) that adds a
**model-based clickbait filter** alongside its existing keyword filters.

Upstream's README documents the limitation this addresses:

> 关键词不宜过于简单，可能造成误伤，屏蔽过多视频影响浏览体验
> 编写正则要慎重，可能造成大量视频屏蔽和频繁载入

Instead of a hand-maintained regex list, each video title is scored by an XLM-RoBERTa clickbait
classifier and hidden above a threshold. Every upstream filter is left intact.

## Architecture

```
bilibili page
 └─ userscript (Tampermonkey)
     └─ ClickbaitFilter        implements upstream's ISubFilter
         └─ clickbaitScorer    batch(40/25ms) + LRU(5000) + circuit breaker + fail-open
             └─ GM_xmlhttpRequest ──▶ 127.0.0.1:8731  (server/scorer.py)
                                        └─ XLM-RoBERTa clickbait model
```

`ClickbaitFilter.check()` follows upstream's contract exactly — resolve to keep a card, reject to hide
it — so it slots in beside `KeywordFilter` with no pipeline changes. Upstream already runs subfilters
concurrently under `pLimit(10)` and marks processed cards, which composes well with batching+caching.

## Setup

```bash
pip install torch transformers          # first run downloads ~1.1GB
python server/scorer.py                 # http://127.0.0.1:8731

pnpm install && pnpm run build          # -> dist/*.user.js
```

Install `dist/*.user.js` in Tampermonkey, then on bilibili: 视频过滤 → **标题党过滤（AI 模型）** →
enable, threshold default 80%.

> **Chrome 138+** requires enabling **"Allow User Scripts"** on the Tampermonkey entry in
> `chrome://extensions`. Without it userscripts install but never execute, with no error shown.

## Behaviour

- **Fails open** — if the scorer is unreachable every title scores 0 and nothing is hidden.
- **Circuit breaker** — 5 consecutive failures mutes requests for 30s.
- **Batched** — ≤40 titles/request, 25ms coalescing; a 30-card feed is one round trip.
- **Cached** — 5000-entry LRU client-side, 20000 server-side.

## Model

`christinacdl/XLM_RoBERTa-Clickbait-Detection-NEW-Data` (278M).

Measured on 200 hand-labeled bilibili home-feed titles (49 positives, majority baseline 0.755):

| metric | value |
|---|---|
| AUC | 0.758 |
| best CV accuracy | 0.810 |
| F1 | 0.558 |
| latency | ~34 ms/title (CPU) |

Chosen by benchmarking 22 open clickbait models. Two findings drove selection:

- **English-only backbones are useless on Chinese titles** — all scored 0.516–0.616 (chance). Only
  multilingual backbones (XLM-R / mBERT) transfer.
- **A multilingual backbone is necessary but not sufficient** — XLM-R models fine-tuned on the wrong
  task (SemEval spoiler-type classification) also scored ~0.53.

### Honest limits

Recall is ~0.39–0.51 at usable thresholds — it catches roughly half of clickbait, and is far stronger
on blatant bait than on the ambiguous middle. Run it at a high threshold as a high-precision filter,
not a catch-all. The 200 labels come from a single annotator, so treat the numbers as directional.

## Changes to upstream code

Two defensive edits outside the new files, both in the interest of full disclosure:

1. `src/utils/tool.ts` — `waitForEle()` only resolved when the *added node itself* matched the
   selector, which misses a target that arrives inside a subtree appended as a whole. A re-query
   fallback was added. **Necessity unverified**: it was added while debugging a failure later traced
   to the rAF issue below, and instrumentation showed the re-resolve path never engaging. It is
   harmless but may be unnecessary.
2. `src/modules/filters/variety/video/pages/homepage.ts` — re-resolves `this.target` if it becomes
   disconnected. Also defensive; also never observed to trigger.

## Testing note: requestAnimationFrame and hidden tabs

Upstream writes all hide/visit attributes inside a `requestAnimationFrame` callback. **Chrome pauses
rAF in hidden tabs**, so under headless/automated browser control the filter runs correctly, computes
the right hits, and then silently drops every DOM write. It looks exactly like a broken filter.

If you are testing this programmatically, assert on `document.visibilityState` first, or the results
will be meaningless.

## Tests

```bash
npx vitest run                        # 11 client tests: batching, dedup, cache, fail-open, breaker
python server/tests/test_scorer.py    # service: API, edge cases, accuracy on the 200 labeled titles
```

`server/tests/data200.py` holds the 200 labeled titles used as the accuracy fixture.

## License

MIT, inherited from upstream. Upstream README preserved as `README.upstream.md`.
