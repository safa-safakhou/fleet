"""Selective recall gate fixed before the held-out cases were evaluated.
An uncertain answer leaves deterministic recall unchanged. No strategic decisions.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import torch
import laya
from importlib.metadata import version
from evaluate import predict, manifest, REVISION, TASK, INSTRUCTIONS

THRESHOLD = 0.65


def lexical(query, texts):
    import re
    terms = set(re.findall(r"[a-z0-9]{3,}", query.lower()))
    scores = [len(terms & set(re.findall(r"[a-z0-9]{3,}", t.lower()))) for t in texts]
    return max(range(len(texts)), key=lambda i: scores[i])


if __name__ == "__main__":
    model_path, certificate_path = map(Path, sys.argv[1:3])
    torch.set_num_threads(2)
    agent = laya.load(str(model_path), device="cpu", fast=False)
    root = Path(__file__).parent
    cases = json.loads((root / "recall-validation.json").read_text())
    development = json.loads((root / "recall-cases.json").read_text()) + json.loads((root / "recall-holdout.json").read_text())
    started = time.monotonic()
    results = []
    accepted = correct = baseline_correct = raw_correct = 0
    for index, case in enumerate(cases):
        for reverse in [False, True]:
            texts = [case["relevant"], case["distractor"]]
            if reverse: texts.reverse()
            answer = predict(agent, case["query"], texts)
            selected = ord(answer["choice"]) - 65
            probability = answer["probabilities"][answer["choice"]]
            passed = texts[selected] == case["relevant"]
            used = probability >= THRESHOLD
            base_passed = texts[lexical(case["query"], texts)] == case["relevant"]
            accepted += int(used)
            correct += int(used and passed)
            baseline_correct += int(used and base_passed)
            raw_correct += int(passed)
            results.append({"case": index, "reverse": reverse, "accepted": used, "correct": passed, "lexicalCorrect": base_passed, "probability": probability})
    dev_errors = 0
    for case in development:
        for reverse in [False, True]:
            texts = [case["relevant"], case["distractor"]]
            if reverse: texts.reverse()
            answer = predict(agent, case["query"], texts)
            if answer["probabilities"][answer["choice"]] >= THRESHOLD and texts[ord(answer["choice"])-65] != case["relevant"]:
                dev_errors += 1
    passed = accepted >= len(cases)//2 and correct == accepted and correct > baseline_correct and dev_errors == 0
    certificate = {"task": TASK, "runtime": version("laya"), "revision": REVISION,
        "casesSha256": hashlib.sha256((root / "recall-validation.json").read_bytes()).hexdigest(),
        "developmentSha256": hashlib.sha256((root / "recall-cases.json").read_bytes()).hexdigest(),
        "cases": len(cases), "predictions": len(cases)*2, "accepted": accepted, "correct": correct,
        "rawCorrect": raw_correct, "lexicalCorrectOnAccepted": baseline_correct, "developmentAcceptedErrors": dev_errors,
        "abstainThreshold": THRESHOLD, "passed": passed, "instruction": INSTRUCTIONS,
        "files": manifest(model_path), "elapsedMs": round((time.monotonic()-started)*1000), "results": results,
        "scope": "Selective two-candidate memory ordering on frozen held-out synthetic cases in both option orders. All memories remain available. No strategy, game outcomes or calibrated-confidence claim."}
    certificate_path.write_text(json.dumps(certificate, indent=2)+"\n")
    os.chmod(certificate_path, 0o600)
    print(json.dumps({k: v for k,v in certificate.items() if k not in ["files", "results"]}))
    if not passed: sys.exit(1)
