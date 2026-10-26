import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import baseline from "../../src/engines/legacy/baseline.json" with { type: "json" };

it("preserves the recorded controller except explicit context, owner, proposal and concurrent shutdown repairs", async () => {
  const source = await readFile(new URL("../../src/engine.ts", import.meta.url));
  const pinned = baseline.files.find((file) => file.path === "src/engine.ts");
  // Preserve the historical pin. Reverse only the explicitly reviewed repairs;
  // any other controller drift still fails against the original source digest.
  let historical = source.toString();
  const reviewed: [string, string][] = [
    // Owner-authorized thinking bounds and numeric-only observability; historical source hash is unchanged.
    ['import { recordCallRequest, recordCallResponse } from "./call-metrics.js";\n', ""],
    ['import { modelCallBound } from "./model-bounds.js";\n', ""],
    [
      "        await recordCallRequest(\n          this.store,\n          reservation,\n          {\n            model: m,\n            messages,\n            schema: outputSchema,\n            maxOutputTokens: b.maxOutputTokens,\n            signal: AbortSignal.timeout(1000),\n          },\n          b.inputByteLimit,\n          this.model,\n        );\n",
      "",
    ],
    [
      "        await recordCallResponse(this.store, reservation, response, this.store.now().getTime() - modelStartedAt);\n",
      "",
    ],
    [
      "              AbortSignal.timeout(\n                Math.max(1, Math.min(modelCallBound(m), claim.deadline.getTime() - this.store.now().getTime())),\n              ),",
      "              AbortSignal.timeout(Math.max(1, Math.min(90000, claim.deadline.getTime() - this.store.now().getTime()))),",
    ],
    // Authorized native inactivity repair: domain-owned wait facts and bounded feedback.
    ["            waitSchema: this.adapter.waitSchema?.(facts),\n", ""],
    [
      '          const valid = this.adapter.validateWait?.(decision.basis ?? {}, facts);\n          if (valid && !valid.valid) {\n            lastCode = valid.code;\n            await rememberFeedback({\n              code: valid.code,\n              guidance: valid.guidance,\n              detail: valid.detail,\n              submitted: false,\n              committed: false,\n            });\n            await observation.record(claim, "deciding", "Wait rejected before completion", {\n              code: valid.code,\n              submitted: false,\n              committed: false,\n            });\n            continue;\n          }\n',
      "",
    ],
    // Explicit opt-in native contracts: original validation, request-scoped feedback and private progress diagnostics.
    [
      '        const authoritativeOutputSchema = outputSchema;\n        // Native grounding is opt-in; the original legacy loop still owns each reservation.\n        const grounding = this.adapter.grounding?.(facts);\n        if (grounding) {\n          const prepared = grounding.policy.prepare({ messages, schema: outputSchema }, grounding.observation);\n          messages = prepared.messages;\n          outputSchema = prepared.schema;\n          const scope = grounding.policy.feedbackScope?.(grounding.observation);\n          const feedback = decisionFeedback.findLast((f) => scope && f.groundingScope === scope);\n          if (feedback && grounding.policy.correctionSchema)\n            outputSchema = grounding.policy.correctionSchema(\n              outputSchema,\n              grounding.observation,\n              feedback as import("./platform/decision-feedback.js").DecisionFeedback,\n            );\n        }\n',
      "",
    ],
    [
      '        if (grounding && !response.decisionError) {\n          const feedback = compileGenerationSchema(authoritativeOutputSchema)(response.decision)\n            ? await grounding.policy.validate(response.decision, grounding.observation, {\n                messages,\n                schema: outputSchema,\n              })\n            : {\n                code: "INVALID_MODEL_OUTPUT",\n                message:\n                  "The original native envelope rejected this response; correct optional fields or omit the optional update.",\n                retryable: true,\n              };\n          await observation.record(claim, "deciding", "Native legacy grounded proposal", {\n            valid: feedback === null,\n            code: feedback?.code ?? "ACCEPTED",\n            attempt: n + 1,\n            requestScope: grounding.policy.feedbackScope?.(grounding.observation),\n          });\n          if (feedback) {\n            lastCode = feedback.code;\n            if (!feedback.retryable) throw new FleetError(feedback.code, true);\n            await rememberFeedback({\n              ...feedback,\n              groundingScope: grounding.policy.feedbackScope?.(grounding.observation),\n            });\n            const query = grounding.policy.refreshQuery?.(feedback);\n            if (query !== undefined) await grounding.refresh(query);\n            continue;\n          }\n          const scope = grounding.policy.feedbackScope?.(grounding.observation);\n          if (scope && decisionFeedback.some((f) => f.groundingScope === scope)) {\n            decisionFeedback.splice(\n              0,\n              decisionFeedback.length,\n              ...decisionFeedback.filter((f) => f.groundingScope !== scope),\n            );\n            await this.store.rememberDecisionFeedback(claim, decisionFeedback.at(-1) ?? null);\n          }\n        }\n',
      "",
    ],
    [
      "          decisionFeedback: decisionFeedback\n            .filter((f) => {\n              const grounding = this.adapter.grounding?.(facts);\n              return !f.groundingScope || f.groundingScope === grounding?.policy.feedbackScope?.(grounding.observation);\n            })\n            .map(promptFeedback),\n",
      "          decisionFeedback: decisionFeedback.map(promptFeedback),\n",
    ],
    [
      "            ...(grounding?.policy.feedbackScope\n              ? { groundingScope: grounding.policy.feedbackScope(grounding.observation) }\n              : {}),\n",
      "",
    ],
    ['import { modelFailureProgress } from "./model-progress.js";\n', ""],
    ['import { compileGenerationSchema } from "./model-schema.js";\n', ""],
    ["            generationProgress: modelFailureProgress(error),\n", ""],
    ["          generationProgress: response.execution,\n", ""],

    // Worker pools: stop every active inference; retain the original artifact digest.
    ["  private readonly controllers = new Set<AbortController>();", "  private controller?: AbortController;"],
    ["    for (const controller of this.controllers) controller.abort();", "    this.controller?.abort();"],
    ["        this.controllers.add(controller);", "        this.controller = controller;"],
    [
      "          this.controllers.delete(controller);",
      "          if (this.controller === controller) this.controller = undefined;",
    ],
    // F06 mechanically relocates only the disk probe; keep the controller pin exact.
    [
      'export { enoughDisk } from "./platform/disk.js";',
      "export async function enoughDisk(path: string, minBytes = 10 * 1024 ** 3) {\n  const stats = await statfs(path);\n  return stats.bavail * stats.bsize >= minBytes;\n}",
    ],
    [
      'import { randomUUID } from "node:crypto";',
      'import { randomUUID } from "node:crypto";\nimport { statfs } from "node:fs/promises";',
    ],
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
    [
      "        const packetLimit = Math.min(\n          b.inputByteLimit - (this.adapter.grounding?.(facts).policy.inputReserveBytes ?? 0),\n          b.perCallTokenLimit - b.maxOutputTokens - 1024,\n        );\n",
      "",
    ],
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
