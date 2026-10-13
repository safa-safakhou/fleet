"""Frozen synthetic recall acceptance; never talks to Fleet, Nemotron or PACT."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from importlib.metadata import version
import torch
import laya

REVISION = "e929ae5cf69bc34259cd2f95c9e91145b818b1f0"
TASK = "laya-recall-v1"
INSTRUCTIONS = "Which remembered event is most relevant to the current question? Select the event that directly helps answer it."


def predict(agent, query, texts):
    return agent.predict(query, {"recall": {"type": "choice", "instructions": INSTRUCTIONS,
        "criteria": {chr(65+i): text for i, text in enumerate(texts)}}})["answers"]["recall"]


def manifest(model_path):
    result = {}
    for path in sorted(model_path.rglob("*")):
        if not path.is_file() or ".cache" in path.parts:
            continue
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        result[str(path.relative_to(model_path))] = digest.hexdigest()
    return result


if __name__ == "__main__":
    model_path, certificate_path = map(Path, sys.argv[1:3])
    torch.set_num_threads(2)
    agent = laya.load(str(model_path), device="cpu", fast=False)
    raw_cases = Path(__file__).with_name("recall-cases.json").read_bytes()
    cases = json.loads(raw_cases)
    correct = 0
    rows = []
    started = time.monotonic()
    for index, case in enumerate(cases):
        choices = [case["relevant"], case["distractor"]]
        outcomes = []
        for reverse in [False, True]:
            texts = list(reversed(choices)) if reverse else choices
            answer = predict(agent, case["query"], texts)
            selected = ord(answer["choice"]) - 65
            passed = texts[selected] == case["relevant"]
            correct += int(passed)
            outcomes.append({"passed": passed, "probabilities": answer["probabilities"]})
        rows.append({"case": index, "orders": outcomes})
    certificate = {"task": TASK, "runtime": version("laya"), "revision": REVISION,
        "casesSha256": hashlib.sha256(raw_cases).hexdigest(), "cases": len(cases), "predictions": len(cases)*2,
        "correct": correct, "passed": correct == len(cases)*2,
        "instruction": INSTRUCTIONS, "files": manifest(model_path),
        "elapsedMs": round((time.monotonic()-started)*1000), "results": rows,
        "scope": "Two-candidate recall relevance on frozen synthetic cases in both option orders; no strategy, confidence calibration or gameplay improvement certification."}
    certificate_path.write_text(json.dumps(certificate, indent=2)+"\n")
    os.chmod(certificate_path, 0o600)
    print(json.dumps({k: v for k,v in certificate.items() if k not in ["files", "results"]}))
    if not certificate["passed"]:
        sys.exit(1)
