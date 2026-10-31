import type { ArtifactRef } from "../contracts.js";
export type ContextLineage = {
  version: "context-lineage@1";
  packetDigest: string;
  spans: {
    id: string;
    sourceClass: string;
    sourceRefs: string[];
    messageIndex: number;
    startByte: number;
    endByte: number;
    unit: "utf8-message-content";
    transform: "identity-utf8@1";
  }[];
  omitted: { id: string; reason: string }[];
  mandatoryCoverage: { expected: number; recorded: number; status: "complete" };
  artifact?: ArtifactRef;
  schema: { digest: string; bytes: number; origin: "worker-contract" };
  retrieval?: { eventId: string; coverage: { status: "complete" | "partial"; expected: number; recorded: number } };
};
