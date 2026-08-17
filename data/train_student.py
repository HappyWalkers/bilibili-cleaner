"""Fine-tune XLM-R base on codex-distilled soft labels.

Usage: train_student.py [--sources bilibili|bilibili,cnspoil] [--out DIR]
Reads:  pool.jsonl+codex_pool.json, cnspoil_titles.json+codex_cnspoil.json
Writes: <out>/  (fine-tuned checkpoint)
Evaluates on the untouched 200-title human-labeled test set.
"""
import argparse, json, pathlib, sys, numpy as np, torch

ap = argparse.ArgumentParser()
ap.add_argument("--sources", default="bilibili,cnspoil",
                help="comma-separated: which source tags to train on")
ap.add_argument("--out", default="student_model")
args = ap.parse_args()
SOURCES = set(args.sources.split(","))
print(f"training on sources: {SOURCES}", flush=True)
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score, precision_recall_fscore_support

HERE = pathlib.Path(__file__).parent
BASE_MODEL = "FacebookAI/xlm-roberta-base"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"device: {DEVICE}", flush=True)

# ---- load all sources + codex soft labels, tracking provenance ----
def load_source(title_file, score_file, tag):
    rows = [json.loads(l) for l in open(HERE / title_file, encoding="utf-8")]
    titles = [r["title"] for r in rows]
    scores = json.load(open(HERE / score_file))
    assert len(scores) == len(titles), (title_file, len(scores), len(titles))
    out = [(t, sc, tag) for t, sc in zip(titles, scores) if sc is not None]
    print(f"  {tag:<10} {len(titles)} titles, {len(out)} usable "
          f"(dropped {len(titles)-len(out)} with no codex score)", flush=True)
    return out

def load_bilibili():
    """pool.jsonl grew from 3,126 to 10,684 titles across two scrape rounds.
    codex_pool.json + codex_pool2.json cover it in two order-preserved parts
    (see the merge step in the commit log). agy_pool_full.json (Gemini,
    validated independently at AUC 0.913 on the 200-title test vs codex's
    0.909, correlation 0.81 -- genuinely complementary, not redundant) covers
    the whole pool in one pass once labeled.

    Soft label = average of codex + agy when both are available for a title,
    else whichever one is. Averaging the two teachers measured AUC 0.930 on
    the 200-title test vs 0.909/0.913 for either alone -- this is the reason
    to prefer it over a single-teacher signal, not just belt-and-suspenders."""
    rows = [json.loads(l) for l in open(HERE / "pool.jsonl", encoding="utf-8")]
    titles = [r["title"] for r in rows]
    s1 = json.load(open(HERE / "codex_pool.json"))
    pool2_file = HERE / "codex_pool2.json"
    if pool2_file.exists():
        codex_scores = s1 + json.load(open(pool2_file))
    else:
        codex_scores = s1 + [None] * (len(titles) - len(s1))
    assert len(codex_scores) == len(titles), ("pool.jsonl vs codex", len(codex_scores), len(titles))

    agy_file = HERE / "agy_pool_full.json"
    agy_scores = json.load(open(agy_file)) if agy_file.exists() else [None] * len(titles)
    if agy_file.exists():
        assert len(agy_scores) == len(titles), ("pool.jsonl vs agy", len(agy_scores), len(titles))
    else:
        print("  note: agy_pool_full.json not found yet, training on codex-only labels", flush=True)

    scores = []
    for c, a in zip(codex_scores, agy_scores):
        if c is not None and a is not None:
            scores.append((c + a) / 2)
        elif c is not None:
            scores.append(c)
        else:
            scores.append(a)  # may be None too; filtered below

    out = [(t, sc, "bilibili") for t, sc in zip(titles, scores) if sc is not None]
    both = sum(1 for c, a in zip(codex_scores, agy_scores) if c is not None and a is not None)
    print(f"  {'bilibili':<10} {len(titles)} titles, {len(out)} usable "
          f"({both} averaged codex+agy, {len(out)-both} single-teacher, "
          f"{len(titles)-len(out)} dropped with no score at all)", flush=True)
    return out

print("loading training sources:", flush=True)
combined = []
if "bilibili" in SOURCES:
    combined += load_bilibili()
cnspoil_titles_f = HERE / "cnspoil_titles.json"
cnspoil_scores_f = HERE / "codex_cnspoil.json"
if "cnspoil" in SOURCES and cnspoil_titles_f.exists() and cnspoil_scores_f.exists():
    cn_titles = json.load(open(cnspoil_titles_f))
    cn_scores = json.load(open(cnspoil_scores_f))
    assert len(cn_titles) == len(cn_scores)
    combined += [(t, sc, "cnspoil") for t, sc in zip(cn_titles, cn_scores) if sc is not None]
    print(f"  {'cnspoil':<10} {len(cn_titles)} titles, "
          f"{sum(1 for s in cn_scores if s is not None)} usable", flush=True)
else:
    print("  cnspoil: not yet labeled, training on bilibili pool only", flush=True)

# dedupe across sources (bilibili pool and CN-Spoil could in principle overlap)
seen, deduped = set(), []
for t, sc, tag in combined:
    if t not in seen:
        seen.add(t); deduped.append((t, sc, tag))
print(f"combined={len(combined)}  after dedupe={len(deduped)}", flush=True)

# leakage guard: assert none of these are in the human-labeled test set
sys.path.insert(0, str(HERE.parent / "server" / "tests"))
from data200 import D as _D_check
_test_titles = {t for _, t in _D_check}
_leak = [t for t, _, _ in deduped if t in _test_titles]
if _leak:
    raise RuntimeError(f"LEAKAGE: {len(_leak)} training titles are in the held-out test set: {_leak[:3]}")
print("leakage check: OK, zero overlap with test set", flush=True)

train_titles = [t for t, _, _ in deduped]
train_scores = np.array([sc for _, sc, _ in deduped], dtype=np.float32)
train_source = [tag for _, _, tag in deduped]
import collections
print("source breakdown:", dict(collections.Counter(train_source)), flush=True)

tr_idx, va_idx = train_test_split(range(len(train_titles)), test_size=0.08, random_state=0)
tr_t = [train_titles[i] for i in tr_idx]; tr_s = train_scores[tr_idx]
va_t = [train_titles[i] for i in va_idx]; va_s = train_scores[va_idx]
print(f"train={len(tr_t)}  val={len(va_t)}", flush=True)

tok = AutoTokenizer.from_pretrained(BASE_MODEL)

class SoftLabelDS(Dataset):
    def __init__(self, titles, scores):
        self.titles, self.scores = titles, scores
    def __len__(self): return len(self.titles)
    def __getitem__(self, i): return self.titles[i], float(self.scores[i])

def collate(batch):
    texts, scores = zip(*batch)
    enc = tok(list(texts), return_tensors="pt", padding=True, truncation=True, max_length=64)
    return enc, torch.tensor(scores, dtype=torch.float32)

BATCH = 32
train_dl = DataLoader(SoftLabelDS(tr_t, tr_s), batch_size=BATCH, shuffle=True, collate_fn=collate)
val_dl = DataLoader(SoftLabelDS(va_t, va_s), batch_size=64, shuffle=False, collate_fn=collate)

model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL, num_labels=1).to(DEVICE)
opt = torch.optim.AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
EPOCHS = 6
steps = len(train_dl) * EPOCHS
sched = get_linear_schedule_with_warmup(opt, num_warmup_steps=int(0.06 * steps), num_training_steps=steps)
loss_fn = nn.BCEWithLogitsLoss()

# ---- fixed held-out human-labeled test set (never trained on) ----
D = _D_check  # already imported above for the leakage check
test_g = np.array([x[0] for x in D]); test_y = (test_g >= 2).astype(int)
test_titles = [x[1] for x in D]

def eval_test():
    model.eval()
    scores = []
    with torch.no_grad():
        for i in range(0, len(test_titles), 32):
            enc = tok(test_titles[i:i+32], return_tensors="pt", padding=True, truncation=True, max_length=64).to(DEVICE)
            logits = model(**enc).logits.squeeze(-1)
            scores += torch.sigmoid(logits).cpu().tolist()
    scores = np.array(scores)
    auc = roc_auc_score(test_y, scores)
    best = (0, .5)
    for t in np.unique(scores):
        a = accuracy_score(test_y, (scores >= t).astype(int))
        if a > best[0]: best = (a, t)
    preds = (scores >= best[1]).astype(int)
    p, r, f1, _ = precision_recall_fscore_support(test_y, preds, average="binary", zero_division=0)
    model.train()
    return auc, best[0], p, r, f1

best_val, best_state, best_epoch = float('inf'), None, 0
for ep in range(EPOCHS):
    model.train()
    tot = 0.0
    for enc, y in train_dl:
        enc = {k: v.to(DEVICE) for k, v in enc.items()}
        y = y.to(DEVICE)
        opt.zero_grad()
        logits = model(**enc).logits.squeeze(-1)
        loss = loss_fn(logits, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step(); sched.step()
        tot += loss.item()
    # val loss (soft-label MSE-ish via BCE) as an early-stop signal, distinct from the human test set
    model.eval()
    vtot = 0.0
    with torch.no_grad():
        for enc, y in val_dl:
            enc = {k: v.to(DEVICE) for k, v in enc.items()}; y = y.to(DEVICE)
            vtot += loss_fn(model(**enc).logits.squeeze(-1), y).item()
    auc, acc, p, r, f1 = eval_test()
    print(f"epoch {ep+1}/{EPOCHS}  train_loss={tot/len(train_dl):.4f}  val_loss={vtot/len(val_dl):.4f}  "
          f"[reporting only, not used for selection] TEST(200 human labels): "
          f"AUC={auc:.3f} acc={acc:.3f} P={p:.3f} R={r:.3f} F1={f1:.3f}", flush=True)
    # Model selection uses val_loss (held out from the training pool), never the human
    # test set -- selecting checkpoints on eval_test() would be mild test-set peeking.
    if vtot < best_val or best_state is None:
        best_val = vtot
        best_epoch = ep + 1
        best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

print(f"\nselected epoch {best_epoch} by val_loss (not test AUC)", flush=True)
model.load_state_dict(best_state)
out_dir = HERE / args.out
model.save_pretrained(out_dir)
tok.save_pretrained(out_dir)
print(f"saved best checkpoint -> {out_dir}", flush=True)
