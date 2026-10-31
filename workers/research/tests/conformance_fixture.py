"""Offline cross-language fixture entry point; never packaged as a live worker endpoint."""

import asyncio
import json
import sys
from fleet_research.worker import run_operation


class FixtureBroker:
    def __init__(self, value):
        self.value = value
        self.count = 0
        self.reads = []
        self.proposals = []
        self.steps = []

    async def model(self, request):
        result = self.value["replies"][self.count]
        self.count += 1
        return result

    async def read(self, tool, args):
        self.reads.append({"tool": tool, "arguments": args})
        return self.value["observation"]

    async def propose(self, proposal):
        self.proposals.append(proposal)
        return {"id": "fixture:proposal", "kind": "proposal"}

    async def checkpoint(self, state):
        return {"id": "fixture:checkpoint", "version": "1"}


async def main(value):
    broker = FixtureBroker(value)
    result = await run_operation(
        broker,
        {
            "instructions": "Supplied PACT evidence only",
            "observation": value["observation"],
            "maxSteps": 4,
            "workerVersion": "fixture@1",
            "policyVersion": "pact-reference@1",
        },
    )
    return {
        "result": result,
        "calls": broker.count,
        "reads": broker.reads,
        "proposals": broker.proposals,
    }


print(json.dumps(asyncio.run(main(json.load(sys.stdin)))))
