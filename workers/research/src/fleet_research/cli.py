"""One operation over private stdin/stdout; no raw payload logging."""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from google.protobuf.json_format import ParseDict
from .client import BrokerClient
from .generated.fleet.v1 import worker_pb2 as w
from .worker import run_operation


async def execute(control):
    value = control["input"]
    ParseDict(value, w.WorkerInput())  # reject unknown wire fields
    deadline = datetime.fromisoformat(
        value["deadlineUtc"].replace("Z", "+00:00")
    ).timestamp()
    broker = BrokerClient(control["socket"], control["token"], value["scope"], deadline)
    try:
        resume = await broker.load()
        async with asyncio.timeout_at(
            asyncio.get_running_loop().time()
            + max(0, deadline - __import__("time").time())
        ):
            result = await run_operation(
                broker,
                {
                    **resume,
                    "workerVersion": value["workerVersion"],
                    "policyVersion": value["policyVersion"],
                    "instructions": value["instructions"],
                    "observation": json.loads(value["observationJson"]),
                    "maxSteps": value["maxSteps"],
                },
            )
        return ParseDict(
            {
                "protocolVersion": 1,
                "workerVersion": value["workerVersion"],
                "status": "proposed",
                **result,
            },
            w.WorkerResult(),
        ).SerializeToString()
    finally:
        await broker.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol-info", action="store_true")
    args = parser.parse_args()
    if args.protocol_info:
        print(
            json.dumps(
                {"protocolVersion": 1, "onlineExecution": True, "retryOwner": "fleet"}
            )
        )
        return
    try:
        control = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
        if len(control) > 4 * 1024 * 1024:
            raise ValueError("INPUT_TOO_LARGE")
        sys.stdout.buffer.write(asyncio.run(execute(json.loads(control))))
    except Exception:
        print("WORKER_EXECUTION_FAILED", file=sys.stderr)
        raise SystemExit(1) from None
