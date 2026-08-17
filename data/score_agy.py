"""Score titles with agy (Gemini). Usage: score_agy.py <in.json> <out.json> [model]

Checkpoints incrementally (writes <out.json> after every batch) so a crash
or timeout on one batch never loses already-completed work -- rerunning
with the same <out.json> resumes rather than restarting from title 1.
"""
import json, re, subprocess, sys, pathlib

MODEL = sys.argv[3] if len(sys.argv) > 3 else "gemini-3.1-pro-high"
PROMPT = """For each numbered Chinese video title below, output ONLY lines of the form "N:S" where N is the title number and S is an integer 0-100 rating how much it is 标题党 (clickbait: deliberately withholds key information, exaggerates, uses suspense or shock to bait clicks). Output exactly {n} lines, nothing else.

{items}"""

def score_batch(titles, start):
    body = "\n".join(f"{start+i+1}. {t}" for i, t in enumerate(titles))
    p = PROMPT.format(n=len(titles), items=body)
    try:
        r = subprocess.run(["agy", "--model", MODEL, "--print", p],
                           capture_output=True, text=True, timeout=900)
        stdout = r.stdout
    except subprocess.TimeoutExpired:
        print(f"  ! batch at {start} timed out after 900s, will retry next run", flush=True)
        return {}
    except Exception as e:
        print(f"  ! batch at {start} failed: {e}", flush=True)
        return {}
    out = {}
    for line in stdout.splitlines():
        m = re.fullmatch(r"\s*(\d+)\s*:\s*(\d+)\s*", line)
        if m:
            idx, sc = int(m.group(1)), int(m.group(2))
            if start < idx <= start + len(titles) and 0 <= sc <= 100:
                out[idx] = sc / 100.0
    return out

titles = json.load(open(sys.argv[1], encoding="utf-8"))
out_path = pathlib.Path(sys.argv[2])
BS = 50

# resume: load whatever's already there (from a prior partial/crashed run)
if out_path.exists():
    prev = json.load(open(out_path))
    scores = {i + 1: v for i, v in enumerate(prev) if v is not None}
    print(f"resuming: {len(scores)}/{len(titles)} already scored", flush=True)
else:
    scores = {}

for i in range(0, len(titles), BS):
    chunk_idx = [j + 1 for j in range(i, min(i + BS, len(titles)))]
    if all(idx in scores for idx in chunk_idx):
        continue  # this whole batch already scored from a prior run
    chunk = titles[i:i + BS]
    got = score_batch(chunk, i)
    scores.update(got)
    res = [scores.get(j + 1) for j in range(len(titles))]
    json.dump(res, open(out_path, "w"))  # checkpoint after every batch
    print(f"batch {i//BS+1}: {len(got)}/{len(chunk)} parsed  (total {len(scores)}/{len(titles)})", flush=True)

res = [scores.get(i + 1) for i in range(len(titles))]
json.dump(res, open(out_path, "w"))
print(f"WROTE {out_path}  missing={sum(1 for x in res if x is None)}", flush=True)
