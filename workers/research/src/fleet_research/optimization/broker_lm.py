"""Pinned DSPy 3.4 custom LM. The native grant is the authoritative budget."""

import json
import threading
from contextlib import contextmanager
from contextvars import ContextVar

import dspy

_case = ContextVar("optimization_case", default=None)


@contextmanager
def case_scope(case_id):
    token = _case.set(case_id)
    try:
        yield
    finally:
        _case.reset(token)


class CallBudget:
    def __init__(self, maximum):
        if not isinstance(maximum, int) or not 1 <= maximum <= 16:
            raise ValueError("OPTIMIZATION_CALL_CAP")
        self.maximum = maximum
        self.calls = 0
        self.allocations = []
        self.refs = []
        self.lock = threading.Lock()

    def reserve(self):
        with self.lock:
            if self.calls >= self.maximum:
                raise ValueError("OPTIMIZATION_CALL_CAP")
            self.calls += 1


class BrokerLM(dspy.BaseLM):
    def __init__(self, broker, dataset_id, candidate_id, budget):
        super().__init__(
            model="fleet/evaluation",
            cache=False,
            num_retries=0,
            temperature=0,
            max_tokens=100,
            callbacks=[],
        )
        self.broker = broker
        self.dataset_id = dataset_id
        self.candidate_id = candidate_id
        self.budget = budget

    def forward(self, prompt=None, messages=None, **kwargs):
        case_id = _case.get()
        if not case_id:
            raise ValueError("OPTIMIZATION_CASE_REQUIRED")
        self.budget.reserve()
        reply = self.broker.call(
            {
                "datasetId": self.dataset_id,
                "candidateId": self.candidate_id,
                "caseId": case_id,
                "phase": "teacher",
                "format": "dspy",
                "prompt": json.dumps(
                    messages or [{"role": "user", "content": prompt}],
                    ensure_ascii=False,
                ),
            }
        )
        if not reply.get("allocationId") or not reply.get("resultRef"):
            raise ValueError("OPTIMIZATION_ALLOCATION_REQUIRED")
        self.budget.allocations.append(reply["allocationId"])
        self.budget.refs.append(reply["resultRef"])
        # No history, cached responses, provider clients, or automatic retry path.
        return {
            "model": self.model,
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(reply["decision"]),
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {},
        }
