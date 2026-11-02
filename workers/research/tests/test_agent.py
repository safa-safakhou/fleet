import pytest
from fleet_research.agent import make_agent
from fleet_research.worker import run_operation
from pydantic import ValidationError
from pydantic_ai.exceptions import UnexpectedModelBehavior


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
    with pytest.raises(UnexpectedModelBehavior):
        await make_agent(broker).run("synthetic")
    assert len(broker.calls) == 1


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_scoped_advisory_contract_forbids_tool_requests_without_hidden_retry():
    broker = Broker()
    schema = {
        "$id": "fleet.one-step-advisory@1",
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": ["advisory", "wait"]},
            "payload": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "minLength": 1, "maxLength": 600}
                },
                "required": ["text"],
                "additionalProperties": False,
            },
            "sourceRefs": {
                "type": "array",
                "items": {"type": "string", "enum": ["fixture:source"]},
                "minItems": 1,
                "maxItems": 1000,
            },
            "preconditions": {"type": "object", "additionalProperties": False},
        },
        "required": ["kind", "payload", "sourceRefs", "preconditions"],
        "additionalProperties": False,
    }
    with pytest.raises(ValidationError):
        await run_operation(
            broker,
            {
                "instructions": "One final advisory decision",
                "observation": {},
                "maxSteps": 1,
                "workerVersion": "python-pydantic@1",
                "policyVersion": "pact-reference@1",
                "outputSchema": schema,
            },
        )
    assert len(broker.calls) == 1
    assert broker.calls[0]["schema"] == schema
    assert broker.reads == []
    assert broker.proposals == []


def test_scoped_advisory_output_validates_exact_references_and_empty_preconditions():
    from fleet_research.agent import scoped_advisory_output

    output = scoped_advisory_output(
        {
            "$id": "fleet.one-step-advisory@1",
            "properties": {"sourceRefs": {"items": {"enum": ["fixture:木材"]}}},
        }
    )
    valid = {
        "kind": "advisory",
        "payload": {"text": "Observed evidence only"},
        "sourceRefs": ["fixture:木材"],
        "preconditions": {},
    }
    assert output.model_validate(valid).model_dump() == valid
    for invalid in [
        {**valid, "kind": "read"},
        {**valid, "kind": "action"},
        {**valid, "sourceRefs": ["invented"]},
        {**valid, "sourceRefs": []},
        {**valid, "preconditions": {"clockId": "invented"}},
        {**valid, "payload": {"text": "x" * 601}},
    ]:
        with pytest.raises(ValidationError):
            output.model_validate(invalid)
    empty = scoped_advisory_output(
        {
            "$id": "fleet.one-step-advisory@1",
            "properties": {"sourceRefs": {"items": {}}},
        }
    )
    assert empty.model_validate({**valid, "sourceRefs": []}).sourceRefs == []
    with pytest.raises(ValidationError):
        empty.model_validate(valid)
