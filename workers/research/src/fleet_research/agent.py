"""Worker-local reasoning only. No provider SDK, effect authority or retry owner."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model
from pydantic_ai import Agent, NativeOutput

from .broker_model import BrokerModel


class DecisionProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["action", "wait", "advisory"]
    payload: dict[str, Any]
    sourceRefs: list[str] = Field(max_length=1000)
    preconditions: dict[str, Any]


def scoped_advisory_output(schema):
    if schema.get("$id") != "fleet.one-step-advisory@1":
        raise ValueError("UNSUPPORTED_OUTPUT_CONTRACT")
    refs = schema["properties"]["sourceRefs"]["items"].get("enum", [])

    class TextPayload(BaseModel):
        model_config = ConfigDict(strict=True, extra="forbid")
        text: str = Field(min_length=1, max_length=600)

    class NoPreconditions(BaseModel):
        model_config = ConfigDict(strict=True, extra="forbid")

    reference = Literal[tuple(refs)] if refs else str
    return create_model(
        "OneStepAdvisory",
        __config__=ConfigDict(strict=True, extra="forbid"),
        kind=(Literal["advisory", "wait"], ...),
        payload=(TextPayload, ...),
        sourceRefs=(
            list[reference],
            Field(min_length=1 if refs else 0, max_length=1000 if refs else 0),
        ),
        preconditions=(NoPreconditions, ...),
    )


def make_agent(broker, instructions="", max_output_tokens=100, output_schema=None):
    output = (
        scoped_advisory_output(output_schema) if output_schema else DecisionProposal
    )
    agent = Agent(
        BrokerModel(broker, output_schema, output if output_schema else None),
        output_type=NativeOutput(output),
        instructions=instructions,
        retries={"tools": 0, "output": 0},
        model_settings={"max_tokens": max_output_tokens},
    )

    async def read_game(tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return await broker.read(tool, arguments)

    if output_schema is None:
        agent.tool_plain(retries=0)(read_game)
    return agent
