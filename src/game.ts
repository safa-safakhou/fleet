import type { NormalizeCommunications } from "./communications.js";
import type { Data, GamePort, Tool } from "./domain.js";

// One deployment selects one reviewed game integration. Core turns own scheduling,
// accounting, identity checks, command recovery and fencing, never game rules.
export interface GameAdapter {
  readonly id: string;
  readonly label: string;
  readonly instructions: string;
  readonly actionKinds: string[];
  actionSchema(kind: string): Data;
  isRead(tool: Tool): boolean;
  initial(game: GamePort, expectedEntityId: string | null): Promise<Data>;
  compactFacts(facts: Data): Data;
  mergeReads(reads: Data[]): Data[];
  boundedReads(reads: Data[], limit?: number): Data[];
  peers(facts: Data): string[];
  peerReads(peer: string): { name: string; args: Data }[];
  readPeer(tool: string, args: Data): string | undefined;
  actionPeer(action: Data): string | undefined;
  normalizeCommunications: NormalizeCommunications;
  ownerFallback(error: unknown): boolean;
  rejection(error: unknown, owner: boolean): string | undefined;
}
