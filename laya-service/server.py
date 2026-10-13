"""Evaluated local recall ordering only. No model training or game authority."""
import hashlib
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from importlib.metadata import version
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import torch
import laya
from evaluate import predict, manifest, REVISION, TASK, INSTRUCTIONS
from verify_recall import THRESHOLD


def verify_certificate(certificate, model_path):
    cases_hash = hashlib.sha256(Path(__file__).with_name("recall-validation.json").read_bytes()).hexdigest()
    if not (certificate.get("passed") is True and certificate.get("task") == TASK and
            certificate.get("runtime") == "0.4.6" and certificate.get("revision") == REVISION and
            certificate.get("instruction") == INSTRUCTIONS and certificate.get("abstainThreshold") == THRESHOLD and
            certificate.get("casesSha256") == cases_hash and certificate.get("cases") == 16 and
            certificate.get("predictions") == 32 and certificate.get("accepted", 0) >= 8 and
            certificate.get("correct") == certificate.get("accepted") and
            certificate.get("correct", 0) > certificate.get("lexicalCorrectOnAccepted", 0) and
            certificate.get("developmentAcceptedErrors") == 0):
        raise ValueError("Recall acceptance gate required")
    if certificate.get("files") != manifest(model_path):
        raise ValueError("Model files differ from evaluated checkpoint")
    return hashlib.sha256(json.dumps(certificate, sort_keys=True).encode()).hexdigest()


def validate(body):
    if not isinstance(body, dict) or set(body) != {"query", "candidates"}:
        raise ValueError("shape")
    if not isinstance(body["query"], str) or not 1 <= len(body["query"]) <= 240:
        raise ValueError("query")
    candidates = body["candidates"]
    if not body["query"].isascii():
        raise ValueError("language not evaluated")
    if not isinstance(candidates, list) or len(candidates) != 2:
        raise ValueError("two candidates required")
    for candidate in candidates:
        if not isinstance(candidate, dict) or set(candidate) != {"id", "text"} or not isinstance(candidate["id"], str) or not 1 <= len(candidate["id"]) <= 100 or not isinstance(candidate["text"], str) or not 1 <= len(candidate["text"]) <= 220:
            raise ValueError("candidate")
    if len({c["id"] for c in candidates}) != 2:
        raise ValueError("duplicate candidates")
    if not all(c["text"].isascii() for c in candidates):
        raise ValueError("language not evaluated")
    return candidates


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, code, body):
        data = json.dumps(body, allow_nan=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            self.reply(404, {"code": "LAYA_NOT_FOUND"})
            return
        self.reply(200, METADATA)

    def do_POST(self):
        if self.path != "/recall":
            self.reply(404, {"code": "LAYA_NOT_FOUND"})
            return
        self.connection.settimeout(3)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if self.headers.get("Origin") or self.headers.get("Content-Type") != "application/json" or not 0 < size <= 4096:
                raise ValueError("request")
            body = json.loads(self.rfile.read(size))
            candidates = validate(body)
            answer = predict(AGENT, body["query"], [c["text"] for c in candidates])
            selected = ord(answer["choice"])-65
            probability = answer["probabilities"][answer["choice"]]
            if not 0 <= selected < 2 or not 0 < probability <= 1:
                raise ValueError("answer")
        except Exception:
            self.reply(400, {"code": "LAYA_INVALID_REQUEST"})
            return
        self.reply(200, {**METADATA, "abstained": probability < THRESHOLD,
                         "id": candidates[selected]["id"], "probability": probability})


if __name__ == "__main__":
    if version("laya") != "0.4.6":
        raise ValueError("Pinned Laya required")
    model_path = Path(os.environ["FLEET_LAYA_MODEL_PATH"])
    certificate = json.loads(Path(os.environ["FLEET_LAYA_CERT_PATH"]).read_text())
    certificate_hash = verify_certificate(certificate, model_path)
    torch.set_num_threads(2)
    AGENT = laya.load(str(model_path), device="cpu", fast=False)
    METADATA = {"task": TASK, "runtime": "0.4.6", "revision": REVISION, "certificate": certificate_hash}
    HTTPServer(("127.0.0.1", 8832), Handler).serve_forever()
