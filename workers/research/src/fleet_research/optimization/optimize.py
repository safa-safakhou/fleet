"""Seeded bounded BootstrapFewShot reference. Export is never activation."""

import json
import random

import dspy

from .broker_lm import BrokerLM, CallBudget, case_scope
from .export import digest, export_candidate


class Decision(dspy.Signature):
    """Return a strict bounded PACT proposal using only authorized actor input."""

    case_id: str = dspy.InputField()
    case_text: str = dspy.InputField()
    answer: str = dspy.OutputField(desc="JSON decision proposal")


class Program(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predict = dspy.Predict(Decision)

    def forward(self, case_id, case_text):
        with case_scope(case_id):
            return self.predict(case_id=case_id, case_text=case_text)


def optimize(config, dataset, broker):
    maximum = config["maxDemos"]
    if not isinstance(maximum, int) or not 1 <= maximum <= 2:
        raise ValueError("DEMONSTRATION_CAP")
    if "heldout" in dataset:
        raise ValueError("HELDOUT_ACCESS_DENIED")
    budget = CallBudget(config["maxCalls"])
    lm = BrokerLM(broker, dataset["manifest"]["id"], "reference", budget)
    train = [
        dspy.Example(
            case_id=c["id"],
            case_text=c["actorInput"],
            answer=json.dumps(c["recordedOutput"]),
        ).with_inputs("case_id", "case_text")
        for c in dataset["train"]
    ]
    random.Random(config["seed"]).shuffle(train)

    def exact(example, prediction, trace=None):
        try:
            return json.loads(example.answer) == json.loads(prediction.answer)
        except (ValueError, TypeError):
            return False

    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    with dspy.context(
        lm=lm, adapter=dspy.JSONAdapter(), disable_history=True, callbacks=[]
    ):
        compiler = dspy.BootstrapFewShot(
            metric=exact,
            max_bootstrapped_demos=maximum,
            max_labeled_demos=0,
            max_rounds=1,
            max_errors=1,
            teacher_settings={"lm": lm},
        )
        compiled = compiler.compile(Program(), trainset=train)
    demos = [
        {"case_id": d.case_id, "case_text": d.case_text, "answer": d.answer}
        for d in compiled.predict.demos
    ]
    if len(budget.allocations) != budget.calls:
        raise ValueError("OPTIMIZATION_LINEAGE_INCOMPLETE")
    content = {
        "optimizer": "dspy-bootstrap-fewshot@1",
        "optimizerVersion": "3.4.1",
        "moduleVersion": "pact-bounded-decision@1",
        "signature": "case_id, case_text -> answer",
        "instructions": Decision.instructions,
        "seed": config["seed"],
        "datasetDigest": digest(dataset["manifest"]),
        "splitDigests": dataset["manifest"]["splitDigests"],
        "demonstrations": demos,
    }
    return export_candidate(
        content,
        {
            "calls": budget.calls,
            "allocationIds": budget.allocations,
            "resultRefs": budget.refs,
        },
    )
