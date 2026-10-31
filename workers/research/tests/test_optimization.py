import json
from pathlib import Path

import pytest
from fleet_research.optimization.broker_lm import BrokerLM, CallBudget, case_scope
from fleet_research.optimization.dataset import load_dataset
from fleet_research.optimization.export import export_candidate
from fleet_research.optimization.optimize import optimize

MANIFEST = Path(__file__).resolve().parents[3] / "evals/pact/datasets/manifest.json"


class FakeBroker:
    def __init__(self, cases):
        self.cases = {case["id"]: case for case in cases}
        self.calls = []

    def call(self, request):
        assert request["caseId"] in self.cases
        assert "heldout" not in request["caseId"]
        self.calls.append(request)
        answer = self.cases[request["caseId"]]["recordedOutput"]
        return {
            "decision": {"answer": json.dumps(answer)},
            "allocationId": f"allocation-{len(self.calls)}",
            "resultRef": f"artifact-{len(self.calls)}",
            "usage": {"inputTokens": "7", "outputTokens": "8"},
        }


def test_bounded_optimization_has_no_hidden_teacher():
    dataset = load_dataset(MANIFEST)
    assert "heldout" not in dataset
    broker = FakeBroker(dataset["train"])
    candidate = optimize({"seed": 42, "maxCalls": 16, "maxDemos": 2}, dataset, broker)
    assert 1 <= len(broker.calls) <= 16
    assert all(call["phase"] == "teacher" for call in broker.calls)
    assert len(candidate["content"]["demonstrations"]) <= 2
    assert candidate["lineage"]["calls"] == len(broker.calls)
    assert not any(
        "heldout" in demo["case_id"] for demo in candidate["content"]["demonstrations"]
    )
    assert (
        export_candidate(candidate["content"], candidate["lineage"])["digest"]
        == candidate["digest"]
    )
    changed = {**candidate["content"], "seed": 43}
    assert (
        export_candidate(changed, candidate["lineage"])["digest"] != candidate["digest"]
    )


def test_actual_lm_boundary_caps_calls_even_across_dspy_copies():
    dataset = load_dataset(MANIFEST)
    broker = FakeBroker(dataset["train"])
    budget = CallBudget(16)
    lm = BrokerLM(broker, dataset["manifest"]["id"], "reference", budget)
    for i in range(16):
        with case_scope(dataset["train"][0]["id"]):
            lm.copy().forward(messages=[{"role": "user", "content": "synthetic"}])
    with (
        case_scope(dataset["train"][0]["id"]),
        pytest.raises(ValueError, match="OPTIMIZATION_CALL_CAP"),
    ):
        lm.forward(messages=[{"role": "user", "content": "must not dispatch"}])
    assert len(broker.calls) == 16
    with pytest.raises(ValueError, match="HELDOUT_ACCESS_DENIED"):
        load_dataset(MANIFEST, split="heldout")


def test_overlap_is_rejected_before_reading_any_split(tmp_path):
    manifest = json.loads(MANIFEST.read_text())
    heldout = next(r for r in manifest["records"] if r["split"] == "heldout")
    heldout["family"] = manifest["records"][0]["family"]
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="DATASET_SPLIT_OVERLAP"):
        load_dataset(path)


def test_seeded_export_is_repeatable_without_shared_lm_history():
    dataset = load_dataset(MANIFEST)
    spec = {"seed": 42, "maxCalls": 16, "maxDemos": 2}
    first = optimize(spec, dataset, FakeBroker(dataset["train"]))
    second = optimize(spec, dataset, FakeBroker(dataset["train"]))
    assert first == second
