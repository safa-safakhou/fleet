import { z } from "zod";
import { FleetError } from "../../domain.js";
import { compileGenerationSchema } from "../../model-schema.js";
import type { CheckpointState } from "../broker/checkpoints.js";
import { ProposalSchema } from "../broker/model.js";
import type { DecisionProposal, ResearchBroker, ResearchModelRequest } from "../broker/server.js";
import type { WorkerSession } from "../broker/session.js";
import type { BrokerResult, RunScope } from "../contracts.js";

const ModelValueSchema = z.object({
  decision: z.unknown(),
  usage: z.object({ inputTokens: z.string().nullable(), outputTokens: z.string().nullable() }),
});
const TerminalSchema = z
  .object({ proposalRef: z.object({ id: z.string(), kind: z.string() }), sourceRefs: z.array(z.string()) })
  .strict();
export type WorkerPort = {
  model(request: ResearchModelRequest): Promise<z.infer<typeof ModelValueSchema>>;
  read(tool: string, args: Record<string, unknown>): Promise<unknown>;
  propose(proposal: DecisionProposal): Promise<{ id: string; kind: string }>;
  checkpoint(state: CheckpointState): Promise<{ id: string; version: string }>;
  steps: CheckpointState["steps"];
};
/** Trusted in-process replacement for exactly the same scoped worker protocol. */
export class ReferenceBrokerClient implements WorkerPort {
  counter = 0;
  steps: CheckpointState["steps"] = [];
  version = "0";
  constructor(
    readonly broker: ResearchBroker,
    readonly session: WorkerSession,
    readonly scope: RunScope,
  ) {}
  async value(result: BrokerResult): Promise<unknown> {
    if (result.status !== "completed" || !result.resultRef) throw new FleetError("RECONCILIATION_REQUIRED", true);
    const chunks = [];
    for await (const part of this.broker.artifact(this.session, this.scope, result.resultRef.id))
      chunks.push(Buffer.from(part));
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  key(kind: string) {
    return {
      operationId: this.scope.operationId,
      operationEpoch: this.scope.operationEpoch,
      logicalStepId: `${kind}:${++this.counter}`,
    };
  }
  async execute(kind: string, run: (key: ReturnType<ReferenceBrokerClient["key"]>) => Promise<BrokerResult>) {
    const key = this.key(kind),
      result = await run(key),
      value = await this.value(result);
    this.steps.push({
      logicalStepId: key.logicalStepId,
      operationEpoch: key.operationEpoch,
      resultRef: result.resultRef,
    });
    return { value, ref: result.resultRef! };
  }
  async model(request: ResearchModelRequest) {
    return ModelValueSchema.parse(
      (await this.execute("model", (key) => this.broker.requestModel(this.session, this.scope, key, request))).value,
    );
  }
  async read(tool: string, args: Record<string, unknown>) {
    return (
      await this.execute("read", (key) =>
        this.broker.readGame(this.session, this.scope, key, { tool, arguments: args }),
      )
    ).value;
  }
  async propose(proposal: DecisionProposal) {
    return (await this.execute("proposal", (key) => this.broker.proposeAction(this.session, this.scope, key, proposal)))
      .ref;
  }
  async checkpoint(state: CheckpointState) {
    const ref = await this.broker.checkpoint(this.session, this.scope, this.version, state);
    this.version = ref.version;
    return ref;
  }
}
export const OutputSchema = z.toJSONSchema(ProposalSchema, { target: "draft-7" });
export async function runReferenceWorker(
  broker: WorkerPort,
  input: {
    instructions: string;
    observation: unknown;
    outputSchema?: Record<string, unknown>;
    maxSteps: number;
    maxOutputTokens?: number;
    workerVersion: string;
    policyVersion: string;
    steps?: unknown[];
    blocked?: boolean;
    checkpoint?: (CheckpointState & { id: string; version: string }) | null;
  },
) {
  if (input.blocked) throw new FleetError("RECONCILIATION_REQUIRED", true);
  if (input.checkpoint) {
    const cp = input.checkpoint;
    if (cp.workerVersion !== input.workerVersion || cp.policyVersion !== input.policyVersion)
      throw new FleetError("CHECKPOINT_INCOMPATIBLE", true);
    if (cp.state.terminal)
      return { ...TerminalSchema.parse(cp.state.terminal), checkpointRef: { id: cp.id, version: cp.version } };
  }
  if (input.steps?.length) throw new FleetError("PARTIAL_OPERATION_REQUIRES_RECONCILIATION", true);
  const messages = [
    { role: "system" as const, content: input.instructions },
    { role: "user" as const, content: JSON.stringify(input.observation) },
  ];
  const schema = input.outputSchema ?? OutputSchema,
    validate = compileGenerationSchema(schema);
  for (let n = 0; n < input.maxSteps; n++) {
    const result = await broker.model({
      messages,
      schema,
      maxOutputTokens: input.maxOutputTokens ?? 100,
      purpose: "decision",
    });
    if (result.usage?.inputTokens == null || result.usage?.outputTokens == null)
      throw new FleetError("USAGE_UNKNOWN", true);
    if (!validate(result.decision)) throw new FleetError("PROPOSAL_CONTRACT_INVALID", true);
    const proposal = ProposalSchema.parse(result.decision);
    if (proposal.kind === "read") {
      const read = z
          .object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()) })
          .strict()
          .parse(proposal.payload),
        value = await broker.read(read.tool, read.arguments);
      messages.push({ role: "user", content: JSON.stringify(value) });
      continue;
    }
    const proposalRef = await broker.propose(proposal),
      terminal = { proposalRef, sourceRefs: proposal.sourceRefs };
    const checkpointRef = await broker.checkpoint({
      workerVersion: input.workerVersion,
      policyVersion: input.policyVersion,
      steps: broker.steps,
      sourceRefs: proposal.sourceRefs,
      state: { terminal },
    });
    return { ...terminal, checkpointRef };
  }
  throw new FleetError("WORKER_STEP_LIMIT", true);
}
