"""Single bounded execution. Partial operations require kernel reconciliation."""

import json
from pydantic_ai.usage import UsageLimits
from .agent import make_agent


async def run_operation(broker, input):
    if input.get("blocked"):
        raise ValueError("RECONCILIATION_REQUIRED")
    checkpoint = input.get("checkpoint")
    if checkpoint:
        if (
            checkpoint["workerVersion"] != input["workerVersion"]
            or checkpoint["policyVersion"] != input["policyVersion"]
        ):
            raise ValueError("CHECKPOINT_INCOMPATIBLE")
        terminal = checkpoint.get("state", {}).get("terminal")
        if terminal:
            return {
                **terminal,
                "checkpointRef": {
                    "id": checkpoint["id"],
                    "version": checkpoint["version"],
                },
            }
    if input.get("steps"):
        raise ValueError("PARTIAL_OPERATION_REQUIRES_RECONCILIATION")
    limit = input["maxSteps"]
    if not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError("INVALID_STEP_LIMIT")
    agent = make_agent(broker, input["instructions"])
    result = await agent.run(
        json.dumps(input["observation"], separators=(",", ":")),
        usage_limits=UsageLimits(request_limit=limit, tool_calls_limit=limit),
    )
    proposal = result.output.model_dump()
    ref = await broker.propose(proposal)
    terminal = {"proposalRef": ref, "sourceRefs": proposal["sourceRefs"]}
    saved = await broker.checkpoint(
        {
            "workerVersion": input["workerVersion"],
            "policyVersion": input["policyVersion"],
            "steps": getattr(broker, "steps", []),
            "sourceRefs": proposal["sourceRefs"],
            "state": {"terminal": terminal},
        }
    )
    return {**terminal, "checkpointRef": saved}
