"""Worker-local reasoning only. No provider SDK, effect authority or retry owner."""

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent, NativeOutput
from .broker_model import BrokerModel


class DecisionProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["action", "wait", "advisory"]
    payload: dict[str, Any]
    sourceRefs: list[str] = Field(max_length=1000)
    preconditions: dict[str, Any]


def make_agent(broker, instructions="", max_output_tokens=100):
    agent = Agent(
        BrokerModel(broker),
        output_type=NativeOutput(DecisionProposal),
        instructions=instructions,
        retries={"tools": 0, "output": 0},
        model_settings={"max_tokens": max_output_tokens},
    )

    @agent.tool_plain(retries=0)
    async def read_game(tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return await broker.read(tool, arguments)

    return agent
