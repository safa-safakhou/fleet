"""Authenticated Unix gRPC client. No credentials for native providers or stores."""

import json
import grpc
from google.protobuf.json_format import ParseDict, MessageToDict
from .generated.fleet.v1 import worker_pb2 as w, worker_pb2_grpc as rpc, common_pb2 as c


class BrokerClient:
    def __init__(self, socket, token, scope, deadline):
        if not socket.startswith("/"):
            raise ValueError("WORKER_SOCKET_REQUIRED")
        self.channel = grpc.aio.insecure_channel(
            "unix:" + socket,
            options=[("grpc.max_receive_message_length", 2 * 1024 * 1024)],
        )
        self.stub = rpc.ResearchBrokerServiceStub(self.channel)
        self.scope = ParseDict(scope, c.RunScope())
        self.metadata = (("authorization", "Bearer " + token),)
        self.deadline = deadline
        self.steps = []
        self.counter = 0
        self.version = "0"

    def options(self):
        import time

        remaining = self.deadline - time.time()
        if remaining <= 0:
            raise TimeoutError("WORKER_DEADLINE")
        return {"metadata": self.metadata, "timeout": remaining}

    async def execute(self, kind, value):
        self.counter += 1
        logical = f"{kind}:{self.counter}"
        key = c.OperationKey(
            operation_id=self.scope.operation_id,
            operation_epoch=self.scope.operation_epoch,
            logical_step_id=logical,
        )
        request = w.BrokerRequest(
            protocol_version=1, scope=self.scope, key=key, **value
        )
        reply = await self.stub.Execute(request, **self.options())
        result = reply.result
        if result.status != c.BrokerResult.completed or not result.HasField(
            "result_ref"
        ):
            raise ValueError("RECONCILIATION_REQUIRED")
        ref = MessageToDict(result.result_ref)
        self.steps.append(
            {
                "logicalStepId": logical,
                "operationEpoch": str(key.operation_epoch),
                "resultRef": ref,
            }
        )
        chunks = []
        size = 0
        index = 0
        async for chunk in self.stub.ReadArtifact(
            w.ArtifactReadRequest(scope=self.scope, artifact_id=result.result_ref.id),
            **self.options(),
        ):
            if chunk.index != index or len(chunk.body) > 1048576:
                raise ValueError("ARTIFACT_STREAM_INVALID")
            index += 1
            size += len(chunk.body)
            if size > 4 * 1024 * 1024:
                raise ValueError("ARTIFACT_TOO_LARGE")
            chunks.append(chunk.body)
        return json.loads(b"".join(chunks)), ref

    async def model(self, request):
        value, _ = await self.execute(
            "model",
            {
                "model": w.ModelRequest(
                    messages=[w.ModelMessage(**m) for m in request["messages"]],
                    schema_json=json.dumps(request["schema"]),
                    max_output_tokens=request["maxOutputTokens"],
                    purpose=request["purpose"],
                )
            },
        )
        return value

    async def read(self, tool, arguments):
        value, _ = await self.execute(
            "read",
            {"game": w.GameQuery(tool=tool, arguments_json=json.dumps(arguments))},
        )
        return value

    async def propose(self, proposal):
        _, ref = await self.execute(
            "proposal",
            {
                "proposal": w.DecisionProposal(
                    kind=w.DecisionProposal.Kind.Value(proposal["kind"]),
                    payload_json=json.dumps(proposal["payload"]),
                    source_refs=proposal["sourceRefs"],
                    preconditions_json=json.dumps(proposal["preconditions"]),
                )
            },
        )
        return ref

    async def checkpoint(self, state):
        ref = await self.stub.SaveCheckpoint(
            w.CheckpointRequest(
                scope=self.scope,
                expected_version=int(self.version),
                state_json=json.dumps(state),
            ),
            **self.options(),
        )
        self.version = str(ref.version)
        return {"id": ref.id, "version": self.version}

    async def load(self):
        scoped = w.ScopedRequest(scope=self.scope)
        cp = await self.stub.LoadCheckpoint(scoped, **self.options())
        steps = await self.stub.ListSteps(scoped, **self.options())
        if cp.HasField("ref"):
            self.version = str(cp.ref.version)
        return {
            "checkpoint": json.loads(cp.state_json) if cp.state_json else None,
            "steps": [MessageToDict(s) for s in steps.steps],
            "blocked": steps.blocked,
        }

    async def close(self):
        await self.channel.close()
