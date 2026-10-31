import pytest
from fleet_research.agent import make_agent
from fleet_research.worker import run_operation


class Broker:
    def __init__(self):
        self.calls = []
        self.reads = []
        self.proposals = []

    async def model(self, request):
        self.calls.append(request)
        if len(self.calls) == 1:
            return {
                "decision": {
                    "kind": "read",
                    "payload": {"tool": "look", "arguments": {}},
                    "sourceRefs": ["fixture:source"],
                    "preconditions": {},
                },
                "usage": {"inputTokens": "7", "outputTokens": "8"},
            }
        return {
            "decision": {
                "kind": "advisory",
                "payload": {"text": "Observed a board"},
                "sourceRefs": ["fixture:source"],
                "preconditions": {},
            },
            "usage": {"inputTokens": "9", "outputTokens": "2"},
        }

    async def read(self, tool, arguments):
        self.reads.append((tool, arguments))
        return {"payload": {"square": "a3"}, "sourceRefs": ["fixture:source"]}

    async def propose(self, proposal):
        self.proposals.append(proposal)
        return {"id": "proposal:one", "kind": "proposal"}

    async def checkpoint(self, state):
        return {"id": "checkpoint:one", "version": "1"}


@pytest.mark.anyio
async def test_agent_uses_only_broker_and_preserves_source_refs():
    broker = Broker()
    result = await run_operation(
        broker,
        {
            "instructions": "Use only supplied synthetic facts.",
            "observation": {"square": "a2"},
            "maxSteps": 4,
            "workerVersion": "python-pydantic@1",
            "policyVersion": "pact-reference@1",
        },
    )
    assert result["proposalRef"] == {"id": "proposal:one", "kind": "proposal"}
    assert result["sourceRefs"] == ["fixture:source"]
    assert len(broker.calls) == 2
    assert broker.reads == [("look", {})]
    schema = broker.calls[0]["schema"]
    assert schema["type"] == "object"
    read = next(
        branch
        for branch in schema["anyOf"]
        if branch["properties"]["kind"].get("const") == "read"
    )
    assert read["properties"]["payload"]["required"] == ["tool", "arguments"]
    assert all(message["role"] != "tool" for message in broker.calls[1]["messages"])


@pytest.mark.anyio
async def test_invalid_output_does_not_trigger_hidden_model_repair():
    class Invalid(Broker):
        async def model(self, request):
            self.calls.append(request)
            return {
                "decision": {"unsupported": True},
                "usage": {"inputTokens": "1", "outputTokens": "1"},
            }

    broker = Invalid()
    with pytest.raises(Exception):
        await make_agent(broker).run("synthetic")
    assert len(broker.calls) == 1


@pytest.fixture
def anyio_backend():
    return "asyncio"
