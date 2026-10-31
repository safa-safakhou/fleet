"""Pydantic model transport; Fleet owns all allocations, retries and credentials."""

import json
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models import Model
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.usage import RequestUsage


class BrokerModel(Model):
    def __init__(self, broker):
        super().__init__(
            profile=ModelProfile(supports_json_schema_output=True, supports_tools=True)
        )
        self.broker = broker

    @property
    def model_name(self):
        return "fleet-broker/v1"

    @property
    def system(self):
        return "fleet"

    async def request(self, messages, model_settings, model_request_parameters):
        prepared = []
        for message in messages:
            for part in message.parts:
                kind = part.part_kind
                if kind in ("system-prompt", "user-prompt", "text"):
                    content = part.content
                    if not isinstance(content, str):
                        raise ValueError("TEXT_ONLY_INPUT_REQUIRED")
                    role = {
                        "system-prompt": "system",
                        "user-prompt": "user",
                        "text": "assistant",
                    }[kind]
                elif kind in ("tool-call", "tool-return"):
                    role = "assistant" if kind == "tool-call" else "tool"
                    content = json.dumps(
                        {
                            "tool": part.tool_name,
                            "value": part.args if kind == "tool-call" else part.content,
                        },
                        separators=(",", ":"),
                    )
                else:
                    raise ValueError("UNSUPPORTED_MODEL_PART")
                prepared.append({"role": role, "content": content})
        params = model_request_parameters
        for instruction in params.instruction_parts or []:
            prepared.insert(0, {"role": "system", "content": instruction.content})
        if params.output_object is None:
            raise ValueError("OUTPUT_SCHEMA_REQUIRED")
        value = await self.broker.model(
            {
                "messages": prepared,
                "schema": params.output_object.json_schema,
                "maxOutputTokens": (model_settings or {}).get("max_tokens", 1024),
                "purpose": "decision",
            }
        )
        usage = value.get("usage", {})
        if usage.get("inputTokens") is None or usage.get("outputTokens") is None:
            raise ValueError("USAGE_UNKNOWN")
        decision = value["decision"]
        if decision.get("kind") == "read":
            parts = [ToolCallPart("read_game", decision.get("payload", {}))]
        else:
            parts = [TextPart(json.dumps(decision, separators=(",", ":")))]
        return ModelResponse(
            parts=parts,
            usage=RequestUsage(
                input_tokens=int(usage["inputTokens"]),
                output_tokens=int(usage["outputTokens"]),
            ),
            model_name=self.model_name,
        )
