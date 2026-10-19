import { object } from "./domain.js";

export type CognitionOutputSample = {
  thinking: boolean;
  profile: string;
  valid: boolean;
  decision: unknown;
};
/** Offline output coverage only. Citation claims require separate accepted-write/source verification. */
export function auditCognitionOutputs(samples: CognitionOutputSample[]) {
  return {
    evidenceScope: "model_proposals_only" as const,
    modes: [true, false].map((thinking) => ({
      thinking,
      profiles: ["legacy-cognition", "reactive-cognition"].map((profile) => {
        const rows = samples.filter((s) => s.thinking === thinking && s.profile === profile);
        let invalid = 0,
          omitted = 0,
          empty = 0,
          memoryProposals = 0,
          sourceLinkedMemoryProposals = 0;
        for (const row of rows) {
          if (!row.valid) {
            invalid++;
            continue;
          }
          const raw = object(row.decision)[profile === "legacy-cognition" ? "cognition" : "continuity"];
          if (raw === undefined) {
            omitted++;
            continue;
          }
          const update = object(raw);
          const meaningful = Object.entries(update).some(([key, value]) => {
            if (key === "expectedVersion") return false;
            if (key === "analysis") return object(value).type !== "none";
            return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
          });
          if (!meaningful) empty++;
          for (const memory of Array.isArray(update.memories) ? update.memories : []) {
            memoryProposals++;
            const refs = object(memory).evidenceRefs;
            if (Array.isArray(refs) && refs.length && refs.every((ref) => typeof ref === "string" && ref.length))
              sourceLinkedMemoryProposals++;
          }
        }
        return { profile, outputs: rows.length, invalid, omitted, empty, memoryProposals, sourceLinkedMemoryProposals };
      }),
    })),
  };
}
