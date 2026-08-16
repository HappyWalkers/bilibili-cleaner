"""Fail loudly if the training pool overlaps the held-out test set."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "server" / "tests"))
from data200 import D

test = {t for _, t in D}
pool = [json.loads(l)["title"] for l in open(pathlib.Path(__file__).parent / "pool.jsonl", encoding="utf-8")]
overlap = sorted(set(pool) & test)
print(f"pool={len(pool)}  test={len(test)}  overlap={len(overlap)}")
if overlap:
    print("LEAKAGE:", overlap[:5])
    sys.exit(1)
print("OK: no leakage")
