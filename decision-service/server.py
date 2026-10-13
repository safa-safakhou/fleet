"""Loopback, stateless VW focus policy. No credentials, game calls or model files.
The encrypted Fleet journal is the source of truth; replay makes crash/retry
behavior independent of Python process lifetime. Request data is never logged.
"""
import json
import math
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from importlib.metadata import version
from vowpalwabbit import Workspace

POLICY = "vw-focus-v1"
VERSION = "9.11.9"
FOCUSES = {"development", "trade", "relationships", "resilience", "observe"}
MAX_BODY = 2_000_000


def features(value):
    if not isinstance(value, dict) or not 1 <= len(value) <= 42:
        raise ValueError("features")
    for key, number in value.items():
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,49}", key):
            raise ValueError("feature name")
        if type(number) not in (int, float) or not math.isfinite(number) or abs(number) > 100:
            raise ValueError("feature value")
    return " ".join(f"{key}:{value[key]:.10g}" for key in sorted(value))


def example(item, labeled=False):
    choices = item["choices"]
    if not isinstance(choices, list) or not 1 <= len(choices) <= 5 or len(set(choices)) != len(choices) or not set(choices) <= FOCUSES:
        raise ValueError("choices")
    lines = ["shared |s " + features(item["features"])]
    chosen = item.get("chosen")
    if labeled:
        probability, reward = item["probability"], item["reward"]
        if type(chosen) is not int or not 0 <= chosen < len(choices):
            raise ValueError("chosen")
        if type(probability) not in (int, float) or not math.isfinite(probability) or not 0 < probability <= 1:
            raise ValueError("probability")
        if type(reward) not in (int, float) or not math.isfinite(reward) or not -1 <= reward <= 1:
            raise ValueError("reward")
    for i, choice in enumerate(choices):
        label = f"0:{-item['reward']:.10g}:{item['probability']:.10g} " if labeled and i == chosen else ""
        lines.append(label + "|a " + choice)
    return "\n".join(lines)


def predict(body):
    if body.get("policy") != POLICY or version("vowpalwabbit") != VERSION:
        raise ValueError("version")
    history = body["history"]
    if not isinstance(history, list) or len(history) > 2000:
        raise ValueError("history")
    current = example(body)
    workspace = Workspace("--cb_explore_adf --cb_type mtr --epsilon 0.2 --random_seed 17 -b 18 --learning_rate 0.5 -q sa --quiet")
    try:
        for row in history:
            workspace.learn(example(row, True))
        p = workspace.predict(current)
        # Do not bias every cold-start agent toward the first focus by tie order.
        if not any(row["reward"] != 0 for row in history):
            p = [1 / len(body["choices"])] * len(body["choices"])
        total = sum(p)
        p = [x / total for x in p]
        return {"policy": POLICY, "version": VERSION, "trained": len(history), "probabilities": p}
    finally:
        workspace.finish()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, value):
        data = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"policy": POLICY, "version": version("vowpalwabbit")})
        else:
            self.reply(404, {"code": "DECISION_NOT_FOUND"})

    def do_POST(self):
        if self.path != "/predict":
            self.reply(404, {"code": "DECISION_NOT_FOUND"})
            return
        self.connection.settimeout(5)
        try:
            if self.headers.get("Origin") or self.headers.get("Content-Type") != "application/json":
                raise ValueError("origin or content type")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                raise ValueError("size")
            body = json.loads(self.rfile.read(size))
            result = predict(body)
        except Exception:
            self.reply(400, {"code": "DECISION_INVALID_REQUEST"})
            return
        self.reply(200, result)


if __name__ == "__main__":
    if version("vowpalwabbit") != VERSION:
        raise RuntimeError("Pinned VW version required")
    HTTPServer(("127.0.0.1", 8831), Handler).serve_forever()
