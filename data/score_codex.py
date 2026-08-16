"""Score titles with codex (gpt-5.6-sol) in batches. Usage: score_codex.py <in.json> <out.json>"""
import json, re, subprocess, sys, pathlib

PROMPT = """For each numbered Chinese video title below, output ONLY lines of the form "N:S" where N is the title number and S is an integer 0-100 rating how much it is 标题党 (clickbait: deliberately withholds key information, exaggerates, uses suspense or shock to bait clicks). Output exactly {n} lines, nothing else.

{items}"""

def score_batch(titles, start):
    body = "\n".join(f"{start+i+1}. {t}" for i, t in enumerate(titles))
    p = PROMPT.format(n=len(titles), items=body)
    r = subprocess.run(["codex", "exec", "--skip-git-repo-check", p],
                       capture_output=True, text=True, timeout=900)
    out = {}
    for line in r.stdout.splitlines():
        m = re.fullmatch(r"\s*(\d+)\s*:\s*(\d+)\s*", line)
        if m:
            idx, sc = int(m.group(1)), int(m.group(2))
            if start < idx <= start + len(titles) and 0 <= sc <= 100:
                out[idx] = sc / 100.0
    return out

titles = json.load(open(sys.argv[1], encoding="utf-8"))
BS = 50
scores = {}
for i in range(0, len(titles), BS):
    chunk = titles[i:i+BS]
    got = score_batch(chunk, i)
    scores.update(got)
    print(f"batch {i//BS+1}: {len(got)}/{len(chunk)} parsed  (total {len(scores)}/{len(titles)})", flush=True)
res = [scores.get(i+1) for i in range(len(titles))]
json.dump(res, open(sys.argv[2], "w"))
print(f"WROTE {sys.argv[2]}  missing={sum(1 for x in res if x is None)}", flush=True)
