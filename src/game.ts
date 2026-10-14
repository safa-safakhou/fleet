import type { NormalizeCommunications } from "./communications.js";
import type { Data, GamePort, Tool } from "./domain.js";

// One deployment selects one reviewed game integration. Core turns own scheduling,
// accounting, identity checks, command recovery and fencing, never game rules.
export interface GameAdapter {
  decisionObservation?(facts: Data): import("./decision.js").DecisionObservation;
  cognitiveObservation?(facts: Data): { detail: Data; peers: string[] };
  readonly id: string;
  readonly label: string;
  readonly instructions: string;
  readonly actionKinds: string[];
  actionSchema(kind: string): Data;
  isRead(tool: Tool): boolean;
  initial(
    game: GamePort,
    expectedEntityId: string | null,
    context?: { ordinal: number; count: number; turn: number; name: string; discoveryCursor?: Data | null },
  ): Promise<Data>;
  nextDiscoveryCursor?(facts: Data): Data | undefined;
  accountObjective?(facts: Data): string | undefined;
  deliveredContextSummary?(context: Data): Data;
  availableActions?(
    facts: Data,
    ownerPolicy: Data | null,
  ): { kinds: string[]; schemas: Data[]; humanOnly: string[]; matrix?: Data[] };
  reviewableRejection?(code: string, action: Data): boolean;
  preflight?(action: Data, facts: Data): Data | undefined;
  attention?(facts: Data): { label: string; detail: Data } | undefined;
  compactFacts(facts: Data): Data;
  compactEnvironment?(environment: Data, limit: number): Data;
  suppliedReadSchemas?(tools: Tool[]): Data[];
  mergeReads(reads: Data[]): Data[];
  boundedReads(reads: Data[], limit?: number): Data[];
  narrowRead?(read: Data, limit: number): Data;
  applyRead?(facts: Data, tool: string, args: Data, result: Data, expectedEntityId: string | null): void;
  peers(facts: Data): string[];
  peerReads(peer: string): { name: string; args: Data }[];
  readPeer(tool: string, args: Data): string | undefined;
  actionPeer(action: Data): string | undefined;
  normalizeCommunications: NormalizeCommunications;
  ownerFallback(error: unknown): boolean;
  rejection(error: unknown, owner: boolean): string | undefined;
}
