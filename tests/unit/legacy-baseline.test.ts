import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import baseline from "../../src/engines/legacy/baseline.json" with { type: "json" };

it("preserves the recorded controller except the explicit context, owner-assignment and 20 October proposal lookup/feedback repairs", async () => {
  const source = await readFile(new URL("../../src/engine.ts", import.meta.url));
  const pinned = baseline.files.find((file) => file.path === "src/engine.ts");
  // Preserve the historical pin. Reverse only the explicitly reviewed repairs;
  // any other controller drift still fails against the original source digest.
  let historical = source.toString();
  const reviewed: [string, string][] = [
    // Reasoning repair: optional bookkeeping and adapter-owned receipt meaning.
    [
      "        const priorContinuation = continuation.context(decisionState);\n        if (Array.isArray(priorContinuation.outcomes))\n          priorContinuation.outcomes = priorContinuation.outcomes.map((raw) => {\n            const entry = object(raw);\n            return {\n              ...entry,\n              operationMeaning: this.adapter.commandMeaning?.({ kind: entry.actionKind }, { code: entry.code }),\n            };\n          });\n",
      "",
    ],
    ["          continuation: priorContinuation,", "          continuation: continuation.context(decisionState),"],
    [
      '          continuationGuide: {\n            requiredForAction: false,\n            schemaLookup: "fleet_continuation_schema",\n            meaning:\n              "Optional authored plan format only; no gameplay, signature or resource effect. Use only when editing that plan. Choose a game action directly when its facts and shape are already known.",\n          },\n',
      '          continuationGuide:\n            "Optional structured goal/steps/wait: use fleet_continuation_schema for the exact current contract and plan. It is your authored bookkeeping, never authority. Fresh facts, recorded outcomes and current owner intent prevail over old waits or prose.",\n',
    ],
    ["              meaning: this.adapter.commandMeaning?.(object(r.action), object(r.receipt)),\n", ""],
    // Prompt review: preserve observed follow-up shapes through correction/paging.
    [
      "        const requiredShapes = capability?.requiredSchemas ?? [];\n        const actionShapes = [\n          ...new Set([...requiredShapes, ...(correctionShapes.length ? correctionShapes : initialShapes)]),\n        ];\n",
      "        const actionShapes = correctionShapes.length ? correctionShapes : initialShapes;\n",
    ],
    ["                    requiredShapes.includes(shape) ||\n", ""],
    [
      "            const shape = this.adapter.proposalSchema\n              ? this.adapter.proposalSchema(String(object(entry.args).kind), facts)\n              : actionSchema(String(object(entry.args).kind));\n            if (shape && !actionShapes.some((s) => JSON.stringify(s) === JSON.stringify(shape)))\n              actionShapes.push(shape);\n",
      "            const shape = actionSchema(String(object(entry.args).kind));\n            if (!actionShapes.some((s) => JSON.stringify(s) === JSON.stringify(shape))) actionShapes.push(shape);\n",
    ],
    [
      '            result = {\n              schema: this.adapter.proposalSchema\n                ? (this.adapter.proposalSchema(decision.args.kind, facts) ?? null)\n                : actionSchema(decision.args.kind),\n              coverage:\n                "Schema inspection only, not a fresh game-state read. Null means no currently observed eligible proposal; read fresh facts or choose another action/wait.",\n            };\n',
      "            result = { schema: actionSchema(decision.args.kind) };\n",
    ],
    [
      "          await rememberFeedback({ actionKind: decision.action.kind, attemptedArgs: decision.action, ...preflight });\n",
      "          await rememberFeedback({ actionKind: decision.action.kind, ...preflight });\n",
    ],

    [
      'import { currentOwnerObjectiveInstruction, ownerRecallQuery, ownerValues } from "./owner-guidance.js";',
      'import { ownerRecallQuery, ownerValues } from "./owner-guidance.js";',
    ],
    [
      '        const instructions =\n          this.adapter.instructions +\n          (cognition ? ` ${analysisInstructions}` : "") +\n          currentOwnerObjectiveInstruction(\n            claim.cohort.owner_guidance === "account_autonomy" ? this.adapter.accountObjective?.(facts) : undefined,\n          );',
      '        const instructions = this.adapter.instructions + (cognition ? ` ${analysisInstructions}` : "");',
    ],
    ["        const packetLimit = Math.min(b.inputByteLimit, b.perCallTokenLimit - b.maxOutputTokens - 1024);\n", ""],
    ["                packetLimit,", "                b.inputByteLimit,"],
    ["                packetLimit\n", "                b.inputByteLimit\n"],
  ];
  for (const [current, original] of reviewed) {
    expect(historical.split(current)).toHaveLength(2);
    historical = historical.replace(current, original);
  }
  expect(createHash("sha256").update(historical).digest("hex")).toBe(pinned?.sha256);
  expect(baseline.sourceRevision).toBe("c212373ccca98d3e064d24ebd2a9398dd94e2a77");
  const ordered = baseline.files.map(({ path, sha256 }) => ({ path, sha256 }));
  expect(createHash("sha256").update(JSON.stringify(ordered)).digest("hex")).toBe(baseline.artifactDigest);
});
