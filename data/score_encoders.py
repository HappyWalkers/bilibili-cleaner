"""Score the pool with the encoder teachers (CPU)."""
import json, pathlib, time, torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

HERE = pathlib.Path(__file__).parent
TEACHERS = {
    "xlmr_new": "christinacdl/XLM_RoBERTa-Clickbait-Detection-new",
    "xlmr_newdata": "christinacdl/XLM_RoBERTa-Clickbait-Detection-NEW-Data",
}
rows = [json.loads(l) for l in open(HERE / "pool.jsonl", encoding="utf-8")]
titles = [r["title"] for r in rows]
out = {r["title"]: {} for r in rows}

for name, mid in TEACHERS.items():
    tok = AutoTokenizer.from_pretrained(mid)
    m = AutoModelForSequenceClassification.from_pretrained(mid); m.eval()
    id2 = {int(k): str(v).lower() for k, v in m.config.id2label.items()}
    cb = next((i for i, l in id2.items() if "click" in l or l in ("1", "label_1")), 1)
    t0 = time.time(); scores = []
    for i in range(0, len(titles), 32):
        x = tok(titles[i:i+32], return_tensors="pt", padding=True, truncation=True, max_length=64)
        with torch.no_grad():
            scores += torch.softmax(m(**x).logits, -1)[:, cb].tolist()
    print(f"{name}: {len(scores)} in {time.time()-t0:.0f}s  ({(time.time()-t0)/len(scores)*1000:.0f} ms/title)", flush=True)
    for t, s in zip(titles, scores): out[t][name] = round(float(s), 5)
    del m, tok

with open(HERE / "teacher_encoders.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print("WROTE teacher_encoders.json", flush=True)
