import { once } from "node:events";
import { chmod, lstat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { type DescMessage, fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import * as grpc from "@grpc/grpc-js";
import { FleetError, safeCode } from "../../domain.js";
import { type BrokerResult, KeySchema, ScopeSchema } from "../contracts.js";
import { ResearchBrokerService } from "../generated/fleet/v1/worker_pb.js";
import type { ResearchBroker } from "./server.js";

type Json = Record<string, any>;
function method(schema: DescMessage) {
  return {
    serialize: (value: Json) => Buffer.from(toBinary(schema, fromJson(schema, value))),
    deserialize: (value: Buffer) => toJson(schema, fromBinary(schema, value), { alwaysEmitImplicit: true }) as Json,
  };
}
export const brokerServiceDefinition: grpc.ServiceDefinition = Object.fromEntries(
  ResearchBrokerService.methods.map((rpc) => {
    const input = method(rpc.input),
      output = method(rpc.output);
    return [
      rpc.localName,
      {
        path: `/${ResearchBrokerService.typeName}/${rpc.name}`,
        requestStream: false,
        responseStream: rpc.methodKind === "server_streaming",
        requestSerialize: input.serialize,
        requestDeserialize: input.deserialize,
        responseSerialize: output.serialize,
        responseDeserialize: output.deserialize,
      },
    ];
  }),
);
function failure(error: unknown): grpc.ServiceError {
  return Object.assign(new Error(safeCode(error)), {
    code: grpc.status.FAILED_PRECONDITION,
    details: safeCode(error),
    metadata: new grpc.Metadata(),
  });
}
/** A private Unix socket is the only worker capability transport. Never binds a TCP listener. */
export async function serveBroker(broker: ResearchBroker, socket: string) {
  if (!isAbsolute(socket)) throw new FleetError("WORKER_SOCKET_REQUIRED", true);
  const dir = await lstat(dirname(socket));
  if (!dir.isDirectory() || (dir.mode & 0o077) !== 0) throw new FleetError("WORKER_SOCKET_PERMISSIONS", true);
  const server = new grpc.Server({
    "grpc.max_receive_message_length": 4 * 1024 * 1024,
    "grpc.max_send_message_length": 2 * 1024 * 1024,
  });
  const context = async (call: { metadata: grpc.Metadata; request: Json }) => {
    const values = call.metadata.get("authorization");
    if (values.length !== 1 || typeof values[0] !== "string" || !values[0].startsWith("Bearer "))
      throw new FleetError("WORKER_SESSION_REQUIRED", true);
    return { session: await broker.authenticate(values[0].slice(7)), scope: ScopeSchema.parse(call.request.scope) };
  };
  const unary =
    (fn: (call: grpc.ServerUnaryCall<Json, Json>) => Promise<Json>) =>
    (call: grpc.ServerUnaryCall<Json, Json>, done: grpc.sendUnaryData<Json>) => {
      void fn(call).then(
        (v) => done(null, v),
        (e) => done(failure(e)),
      );
    };
  const envelope = (scope: Json, result: Json) => ({ protocolVersion: 1, counter: "0", scope, result });
  server.addService(brokerServiceDefinition, {
    execute: unary(async (call) => {
      if (call.request.protocolVersion !== 1) throw new FleetError("PROTOCOL_VERSION_UNSUPPORTED", true);
      const { session, scope } = await context(call),
        key = KeySchema.parse(call.request.key),
        req = call.request;
      let result: BrokerResult;
      if (req.model)
        result = await broker.requestModel(session, scope, key, {
          messages: req.model.messages,
          schema: JSON.parse(req.model.schemaJson),
          maxOutputTokens: req.model.maxOutputTokens,
          purpose: req.model.purpose,
        });
      else if (req.game)
        result = await broker.readGame(session, scope, key, {
          tool: req.game.tool,
          arguments: JSON.parse(req.game.argumentsJson),
        });
      else if (req.proposal)
        result = await broker.proposeAction(session, scope, key, {
          kind: req.proposal.kind,
          payload: JSON.parse(req.proposal.payloadJson),
          sourceRefs: req.proposal.sourceRefs,
          preconditions: JSON.parse(req.proposal.preconditionsJson),
        });
      else if (req.scopedPort)
        result = await broker.scopedPort(
          session,
          scope,
          key,
          req.scopedPort.port,
          JSON.parse(req.scopedPort.argumentsJson),
        );
      else throw new FleetError("REQUEST_REQUIRED", true);
      return envelope(scope, result);
    }),
    lookup: unary(async (call) => {
      const { session, scope } = await context(call);
      return envelope(scope, await broker.lookup(session, scope, KeySchema.parse(call.request.key)));
    }),
    saveCheckpoint: unary(async (call) => {
      const { session, scope } = await context(call);
      return broker.checkpoint(session, scope, call.request.expectedVersion, JSON.parse(call.request.stateJson));
    }),
    loadCheckpoint: unary(async (call) => {
      const { session, scope } = await context(call),
        cp = await broker.loadCheckpoint(session, scope);
      return cp ? { ref: { id: cp.id, version: cp.version }, stateJson: JSON.stringify(cp) } : {};
    }),
    listSteps: unary(async (call) => {
      const { session, scope } = await context(call),
        rows = await broker.stepMap(session, scope);
      return {
        steps: rows.map((r) => ({
          logicalStepId: r.logical_step_id,
          operationEpoch: r.original_epoch,
          ...(r.result.resultRef ? { resultRef: r.result.resultRef } : {}),
        })),
        blocked: rows.some((r) => r.result.status !== "completed"),
      };
    }),
    readArtifact: (call: grpc.ServerWritableStream<Json, Json>) => {
      void (async () => {
        const { session, scope } = await context(call);
        let index = 0;
        for await (const body of broker.artifact(session, scope, call.request.artifactId)) {
          if (call.cancelled) return;
          if (!call.write({ index: index++, body: Buffer.from(body).toString("base64") })) await once(call, "drain");
        }
        call.end();
      })().catch((e) => call.destroy(failure(e)));
    },
  });
  try {
    await new Promise<void>((resolve, reject) =>
      server.bindAsync(`unix:${socket}`, grpc.ServerCredentials.createInsecure(), (e) => (e ? reject(e) : resolve())),
    );
    await chmod(socket, 0o600);
    return { close: () => new Promise<void>((resolve) => server.tryShutdown(() => resolve())), socket };
  } catch (e) {
    server.forceShutdown();
    throw e;
  }
}
