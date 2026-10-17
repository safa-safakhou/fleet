import { isDeepStrictEqual } from "node:util";
import { object } from "../../../src/domain.js";
import type { ActionIntent, EnvironmentAdapter, Observation, Proposal } from "../../../src/platform/contracts.js";
/** Synthetic environment authority, deliberately unrelated to any real game economy. */
export class CoordinationBoard {
  private revision = 0;
  debits = 0;
  incompatiblePromiseCommits = 0;
  private promises = new Map<string, string>();
  get outcomes() {
    return this.results.size;
  }
  private results = new Map<string, { intent: ActionIntent }>();
  readonly costs: Record<string, string> = { defend: "40", negotiate: "30", messageWest: "0", messageEast: "0" };
  constructor(
    readonly adapter: EnvironmentAdapter,
    now: () => Date,
    parallel = false,
  ) {
    adapter.capabilities = {
      ...adapter.capabilities,
      continuity: true,
      coordination: true,
      parallelReasoning: parallel,
      events: "poll",
    };
    adapter.connect = async (binding) => ({
      observe: async (): Promise<Observation> => {
        const ref = `current:${this.revision}`;
        return {
          schemaId: "board.position.v1",
          revision: String(this.revision),
          observedAt: now().toISOString(),
          environmentTime: { clockId: "board.ply", value: String(this.revision) },
          sourceRefs: [ref],
          payload: {},
          coverage: {},
          continuity: {
            schemaVersion: "fleet.continuity-observation.v1",
            self: {
              capabilities: ["move"],
              needs: { energy: String(50 - this.debits) },
              dependencies: {},
              ownerValues: { objective: "Keep playing" },
            },
            facts: [
              { sourceRef: ref, kind: "state", subject: "self", predicate: "energy", value: String(50 - this.debits) },
            ],
          },
          coordination: {
            schemaVersion: "fleet.coordination.v1",
            atomicExpectedVersion: true,
            claimSchemas: [
              { id: "energy.v1", kind: "resource" },
              { id: "promise.v1", kind: "promise" },
            ],
            capacities: [{ schemaId: "energy.v1", key: "shared", remainingUnits: String(50 - this.debits) }],
            promises: [...this.promises].map(([key, value]) => ({ schemaId: "promise.v1", key, value })),
            focuses: ["defend", "negotiate", "messageWest", "messageEast", "review"].map((id) => ({
              id,
              sourceRefs: [ref],
              observation: { action: id, cost: this.costs[id] ?? "0" },
            })),
            ownerPriorities: {},
            coverage: { synthetic: true },
          },
        };
      },
      validateProposal: async (p: Proposal, observation: Observation) => {
        const to = String(p.intent.payload.to),
          cost = this.costs[to];
        const claims = [
          { schemaId: "energy.v1", kind: "resource", key: "shared", units: cost },
          ...(to.startsWith("message")
            ? [
                {
                  schemaId: "promise.v1",
                  kind: "promise",
                  key: "harbor",
                  value: to === "messageWest" ? "west" : "east",
                },
              ]
            : []),
        ];
        const valid =
          cost !== undefined &&
          p.intent.bindingId === binding.id &&
          p.intent.schemaId === "board.move.v1" &&
          p.intent.expectedVersion === observation.revision &&
          isDeepStrictEqual(p.claims, claims);
        return { valid, code: valid ? "CHECKED" : "CLAIMS_DO_NOT_MATCH_ACTION" };
      },
      catalog: async () => [
        {
          name: "board_move",
          inputSchema: {
            type: "object",
            properties: { to: { type: "string", enum: Object.keys(this.costs) } },
            required: ["to"],
            additionalProperties: false,
          },
        },
      ],
      events: async (cursor) => ({ events: [], nextCursor: cursor, resyncRequired: false }),
      execute: async (intent) => {
        const existing = this.results.get(intent.commandId);
        if (existing) {
          if (!isDeepStrictEqual(existing.intent, intent)) throw Error("COMMAND_ID_REUSE");
          return { commandId: intent.commandId, status: "confirmed", code: "MOVED", sourceRefs: [] };
        }
        const cost = BigInt(this.costs[String(object(intent.payload).to)] ?? "1000000");
        if (intent.expectedVersion !== String(this.revision) || cost > BigInt(50 - this.debits))
          return { commandId: intent.commandId, status: "rejected", code: "STALE_VERSION", sourceRefs: [] };
        const destination = String(intent.payload.to);
        if (destination.startsWith("message")) {
          const value = destination === "messageWest" ? "west" : "east";
          if (this.promises.has("harbor") && this.promises.get("harbor") !== value) this.incompatiblePromiseCommits++;
          this.promises.set("harbor", value);
        }
        this.debits += Number(cost);
        this.revision++;
        this.results.set(intent.commandId, { intent: structuredClone(intent) });
        return {
          commandId: intent.commandId,
          status: "confirmed",
          code: "MOVED",
          sourceRefs: [`receipt:${intent.commandId}`],
        };
      },
      resolve: async (id) => ({
        commandId: id,
        status: this.results.has(id) ? "confirmed" : "unknown",
        code: this.results.has(id) ? "MOVED" : "UNKNOWN",
        sourceRefs: [],
      }),
      close: async () => {},
    });
  }
  advance() {
    this.revision++;
  }
}
