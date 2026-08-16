"""Scrape a large pool of bilibili video titles for pseudo-label training."""
import json, time, urllib.request, sys, pathlib

H = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/"}
OUT = pathlib.Path(__file__).parent / "pool.jsonl"

def get(url, tries=2):
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers=H)
            return json.load(urllib.request.urlopen(req, timeout=15))
        except Exception:
            time.sleep(0.6)
    return None

RIDS = [1,3,4,5,11,13,17,21,23,26,29,36,71,75,76,119,123,129,138,155,160,
        165,177,181,188,202,207,209,211,217,223,234,235]
pool = {}

def add(title, src):
    t = (title or "").strip()
    if 4 <= len(t) <= 120 and t not in pool:
        pool[t] = src

for rid in [0] + RIDS:
    d = get(f"https://api.bilibili.com/x/web-interface/ranking/v2?rid={rid}&type=all")
    for v in ((d or {}).get("data") or {}).get("list") or []:
        add(v.get("title"), "rank")
    time.sleep(0.25)
print(f"after ranking: {len(pool)}", flush=True)

for pn in range(1, 26):
    d = get(f"https://api.bilibili.com/x/web-interface/popular?ps=50&pn={pn}")
    lst = ((d or {}).get("data") or {}).get("list") or []
    if not lst: break
    for v in lst: add(v.get("title"), "popular")
    time.sleep(0.25)
print(f"after popular: {len(pool)}", flush=True)

for rid in RIDS:
    for pn in range(1, 26):
        d = get(f"https://api.bilibili.com/x/web-interface/newlist?rid={rid}&ps=50&pn={pn}")
        arr = ((d or {}).get("data") or {}).get("archives") or []
        if not arr: break
        for v in arr: add(v.get("title"), f"new{rid}")
        time.sleep(0.12)
    print(f"  rid {rid}: pool={len(pool)}", flush=True)

with OUT.open("w", encoding="utf-8") as f:
    for t, s in pool.items():
        f.write(json.dumps({"title": t, "src": s}, ensure_ascii=False) + "\n")
print(f"WROTE {len(pool)} titles -> {OUT}", flush=True)
