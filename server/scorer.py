"""Local clickbait scoring service for the bilibili-clickbait-filter userscript.

Serves XLM-RoBERTa clickbait detection over HTTP so the userscript can score
video titles via GM_xmlhttpRequest (which bypasses page CORS/CSP).

    python server/scorer.py [--port 8731] [--model <hf-id>]
"""
import argparse, json, logging, threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

DEFAULT_MODEL = "christinacdl/XLM_RoBERTa-Clickbait-Detection-NEW-Data"
MAX_BATCH = 64
CACHE_SIZE = 20000

log = logging.getLogger("scorer")


class Scorer:
    def __init__(self, model_id: str):
        log.info("loading %s ...", model_id)
        self.tok = AutoTokenizer.from_pretrained(model_id)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_id)
        self.model.eval()
        # Resolve which logit index means "clickbait" from the label map, with a
        # sane fallback. Getting this backwards silently inverts the whole filter.
        id2label = {int(k): str(v).lower() for k, v in self.model.config.id2label.items()}
        self.cb_idx = next(
            (i for i, l in id2label.items() if "click" in l or l in ("1", "label_1", "pos", "positive")),
            1 if self.model.config.num_labels > 1 else 0,
        )
        log.info("id2label=%s -> clickbait index %d", id2label, self.cb_idx)
        self.cache: "OrderedDict[str, float]" = OrderedDict()
        self.lock = threading.Lock()

    def _cached(self, t):
        with self.lock:
            if t in self.cache:
                self.cache.move_to_end(t)
                return self.cache[t]
        return None

    def _store(self, t, v):
        with self.lock:
            self.cache[t] = v
            self.cache.move_to_end(t)
            while len(self.cache) > CACHE_SIZE:
                self.cache.popitem(last=False)

    def score(self, titles):
        out = [None] * len(titles)
        todo = []
        for i, t in enumerate(titles):
            c = self._cached(t)
            if c is None:
                todo.append(i)
            else:
                out[i] = c
        for s in range(0, len(todo), MAX_BATCH):
            idx = todo[s : s + MAX_BATCH]
            batch = [titles[i] for i in idx]
            enc = self.tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=64)
            with torch.no_grad():
                probs = torch.softmax(self.model(**enc).logits, -1)[:, self.cb_idx].tolist()
            for i, p in zip(idx, probs):
                out[i] = float(p)
                self._store(titles[i], float(p))
        return out


def make_handler(scorer: Scorer):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _send(self, code, payload):
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self._send(204, {})

        def do_GET(self):
            if self.path.startswith("/health"):
                self._send(200, {"status": "ok", "cached": len(scorer.cache)})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if not self.path.startswith("/score"):
                self._send(404, {"error": "not found"})
                return
            try:
                n = int(self.headers.get("Content-Length", 0))
                req = json.loads(self.rfile.read(n) or b"{}")
                titles = req.get("titles") or []
                if not isinstance(titles, list):
                    raise ValueError("titles must be a list")
                titles = [str(t) for t in titles]
                self._send(200, {"scores": scorer.score(titles) if titles else []})
            except Exception as e:
                log.exception("score failed")
                self._send(400, {"error": str(e)[:200]})

        def log_message(self, *a):
            pass

    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8731)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(Scorer(a.model)))
    log.info("listening on http://127.0.0.1:%d  (POST /score, GET /health)", a.port)
    srv.serve_forever()


if __name__ == "__main__":
    main()
