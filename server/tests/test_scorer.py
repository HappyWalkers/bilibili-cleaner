"""Tests for the clickbait scoring service.

Run the server first:  python server/scorer.py
Then:                  python server/tests/test_scorer.py
"""
import json, sys, time, urllib.request, urllib.error
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from data200 import D

BASE = "http://127.0.0.1:8731"
FAILS = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + detail if detail else ''}")
    if not cond:
        FAILS.append(name)


def post(path, obj, timeout=120):
    req = urllib.request.Request(BASE + path, data=json.dumps(obj).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def auc(y, s):
    pairs = sorted(zip(s, y))
    order = [p[0] for p in pairs]
    r, i = [0.0] * len(order), 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and order[j + 1] == order[i]:
            j += 1
        for k in range(i, j + 1):
            r[k] = (i + j) / 2 + 1
        i = j + 1
    pos = [r[k] for k, (_, yy) in enumerate(pairs) if yy == 1]
    np_, nn = sum(y), len(y) - sum(y)
    return (sum(pos) - np_ * (np_ + 1) / 2) / (np_ * nn)


print("1. health")
h = json.load(urllib.request.urlopen(BASE + "/health", timeout=10))
check("health returns ok", h.get("status") == "ok", str(h))

print("2. basic scoring + range")
titles = ["震惊！他竟然这样做，99%的人都不知道", "如何用 Python 读取 CSV 文件"]
s = post("/score", {"titles": titles})["scores"]
check("returns one score per title", len(s) == 2, str(s))
check("scores in [0,1]", all(0.0 <= x <= 1.0 for x in s), str([round(x, 3) for x in s]))
check("bait scores above plain title", s[0] > s[1], f"{s[0]:.3f} vs {s[1]:.3f}")

print("3. determinism + cache")
a = post("/score", {"titles": titles})["scores"]
check("repeat call identical", a == s, f"{a} vs {s}")
t0 = time.time(); post("/score", {"titles": titles}); cached_ms = (time.time() - t0) * 1000
check("cached call is fast (<80ms)", cached_ms < 80, f"{cached_ms:.0f}ms")

print("4. edge cases")
check("empty list ok", post("/score", {"titles": []})["scores"] == [])
check("empty string scored", len(post("/score", {"titles": [""]})["scores"]) == 1)
long = "很" * 500
check("very long title ok", len(post("/score", {"titles": [long]})["scores"]) == 1)
try:
    post("/score", {"titles": "notalist"})
    check("rejects non-list titles", False)
except urllib.error.HTTPError as e:
    check("rejects non-list titles", e.code == 400, f"HTTP {e.code}")

print("5. accuracy on 200 labeled bilibili titles")
y = [1 if g >= 2 else 0 for g, _ in D]
tl = [t for _, t in D]
t0 = time.time(); sc = post("/score", {"titles": tl})["scores"]; dt = time.time() - t0
a = auc(y, sc)
check("AUC matches benchmark (>=0.72)", a >= 0.72, f"AUC={a:.3f}")
check("throughput < 250 ms/title", dt / len(tl) * 1000 < 250, f"{dt/len(tl)*1000:.0f} ms/title")
best = max(((sum((s >= th) == bool(l) for s, l in zip(sc, y)) / len(y)), th)
           for th in [i / 100 for i in range(50, 100)])
check("beats majority baseline 0.755", best[0] > 0.755, f"acc={best[0]:.3f} @thr={best[1]:.2f}")

print("6. batch consistency")
one = post("/score", {"titles": [tl[0]]})["scores"][0]
check("single == batched score", abs(one - sc[0]) < 1e-6, f"{one:.6f} vs {sc[0]:.6f}")

print()
if FAILS:
    print(f"FAILED ({len(FAILS)}): {', '.join(FAILS)}")
    sys.exit(1)
print("ALL SERVER TESTS PASSED")
