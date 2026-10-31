import * as grpc from "@grpc/grpc-js";
import type { EvaluationPort, EvaluationReply } from "../../../evals/pact/provider.js";
import { brokerServiceDefinition } from "../broker/transport.js";
import type { RunScope } from "../contracts.js";
/** Worker exposes only the evaluation capability, not native game/DB/provider credentials. */
export class EvaluationRPCClient implements EvaluationPort {
  private readonly client: grpc.Client;
  private readonly metadata = new grpc.Metadata();
  private counter = 0;
  constructor(
    socket: string,
    token: string,
    readonly scope: RunScope,
  ) {
    this.client = new grpc.Client(`unix:${socket}`, grpc.credentials.createInsecure(), {
      "grpc.max_receive_message_length": 4 * 1024 * 1024,
    });
    this.metadata.set("authorization", `Bearer ${token}`);
  }
  async call(input: Parameters<EvaluationPort["call"]>[0]): Promise<EvaluationReply> {
    const method = brokerServiceDefinition.execute,
      key = {
        operationId: this.scope.operationId,
        operationEpoch: this.scope.operationEpoch,
        logicalStepId: `port:${++this.counter}`,
      };
    const reply = await new Promise<any>((resolve, reject) =>
      this.client.makeUnaryRequest(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        {
          protocolVersion: 1,
          scope: this.scope,
          key,
          scopedPort: { port: "evaluation.model", argumentsJson: JSON.stringify([input]) },
        },
        this.metadata,
        { deadline: Date.now() + 60000 },
        (e, r) => (e ? reject(e) : resolve(r)),
      ),
    );
    if (reply.result.status !== "completed" || !reply.result.resultRef?.id || !reply.result.allocationId)
      throw Error("EVALUATION_RECONCILIATION_REQUIRED");
    const artifact = brokerServiceDefinition.readArtifact,
      stream = this.client.makeServerStreamRequest(
        artifact.path,
        artifact.requestSerialize,
        artifact.responseDeserialize,
        { scope: this.scope, artifactId: reply.result.resultRef.id },
        this.metadata,
        { deadline: Date.now() + 60000 },
      );
    const chunks: Buffer[] = [];
    let size = 0,
      index = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk.body, "base64");
      size += bytes.length;
      if (chunk.index !== index++ || bytes.length > 1048576 || size > 4 * 1048576) {
        stream.cancel();
        throw Error("EVALUATION_ARTIFACT_INVALID");
      }
      chunks.push(bytes);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    return {
      output: value.decision,
      allocationId: reply.result.allocationId,
      inputTokens: value.usage.inputTokens,
      outputTokens: value.usage.outputTokens,
      resultRef: reply.result.resultRef.id,
    };
  }
  close() {
    this.client.close();
  }
}
