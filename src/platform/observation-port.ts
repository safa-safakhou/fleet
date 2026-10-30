import type { PoolClient } from "pg";
import type { Data, GamePort, ModelPort } from "../domain.js";
import type { Claim } from "../store.js";
export type ObservationClaim = Pick<Claim, "id" | "agentId" | "cohortId">;
export interface ObservationPort {
  detail(claim: ObservationClaim, stage: string, label: string, detail: Data, db?: PoolClient): Promise<void>;
  model(
    claim: ObservationClaim,
    input: Parameters<ModelPort["decide"]>[0],
    port: ModelPort,
    allocationId?: string,
    purpose?: "decision" | "helper" | "correction",
  ): ReturnType<ModelPort["decide"]>;
  game(agentId: string, port: GamePort): GamePort;
  usage(allocationId: string, status: string, input: number | null, output: number | null): Promise<void>;
  expire(): Promise<void>;
  scoped<T extends object>(claim: ObservationClaim, services: T): T;
}
