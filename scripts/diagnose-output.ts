import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { type Data, FleetError } from "../src/domain.js";
import { HttpModel } from "../src/model.js";
import { qualifyOutput } from "../src/qualification.js";
import { OutputDiagnostic, prepareQualification, QualificationLedger } from "../src/qualification-run.js";

const [parentPath, approvalPath, ...args] = process.argv.slice(2);
if (!parentPath || !approvalPath || args.some((a) => a !== "--execute-approved"))
  throw new FleetError("DIAGNOSTIC_USAGE");
const p = prepareQualification(JSON.parse(await readFile(parentPath, "utf8"))),
  approval = OutputDiagnostic.parse(JSON.parse(await readFile(approvalPath, "utf8")));
console.log(
  JSON.stringify({
    mode: args.includes("--execute-approved") ? "execute-approved" : "review-only",
    parent: p.plan.id,
    approval,
  }),
);
if (args.includes("--execute-approved")) {
  const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (source !== approval.sourceCommit || execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
    throw new FleetError("DIAGNOSTIC_SOURCE_MISMATCH");
  const db = process.env.FLEET_QUALIFICATION_DATABASE_URL,
    keyPath = process.env.FLEET_QUALIFICATION_KEY_FILE,
    out = process.env.FLEET_QUALIFICATION_EVIDENCE_DIR;
  if (!db || !keyPath || !out) throw new FleetError("DIAGNOSTIC_PRIVATE_STORAGE_REQUIRED");
  for (const file of [parentPath, approvalPath, keyPath, out])
    if ((await stat(file)).mode & 0o077) throw new FleetError("DIAGNOSTIC_PRIVATE_STORAGE_REQUIRED");
  const metadata = async (path: string) => {
    const r = await fetch(`${p.plan.endpoint}/api/${path}`, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!r.ok) throw new FleetError("DIAGNOSTIC_METADATA_FAILED");
    return r.json();
  };
  const version = await metadata("version"),
    tags = await metadata("tags");
  if (
    version.version !== "0.35.1" ||
    !tags.models?.some(
      (m: { name: string; digest: string }) => m.name === p.plan.model.model && m.digest === p.plan.modelDigest,
    )
  )
    throw new FleetError("DIAGNOSTIC_MODEL_PIN_MISMATCH");
  const l = await QualificationLedger.open(db, (await readFile(keyPath, "utf8")).trim());
  try {
    const diagnostic = await l.createDiagnostic(p, approval);
    const row = (
      await l.pool.query(
        "SELECT id,detail_cipher FROM qualification_calls WHERE run_id=$1 AND profile='calibration' AND trial='probe-2' AND state='reported'",
        [p.plan.id],
      )
    ).rows[0];
    if (!row) throw new FleetError("DIAGNOSTIC_ORIGINAL_MISSING");
    const detail = l.vault.decrypt<{ request: { schema: Data; messages: { role: string; content: string }[] } }>(
      row.detail_cipher,
      `qualification-call:${row.id}`,
    );
    const results = [];
    for (let i = 1; i <= 4; i++)
      for (const mode of ["original", "schema-grounded"]) {
        const messages = structuredClone(detail.request.messages),
          last = messages.at(-1);
        if (!last) throw new FleetError("DIAGNOSTIC_ORIGINAL_MISSING");
        if (mode === "schema-grounded")
          last.content = JSON.stringify({ ...JSON.parse(last.content), decisionSchema: detail.request.schema });
        const output = await l
          .model(
            p,
            new HttpModel({ ollama: p.plan.endpoint }, undefined),
            "output-diagnostic",
            `${diagnostic}:${mode}:${i}`,
            diagnostic,
          )
          .decide({
            model: p.plan.model,
            messages,
            schema: detail.request.schema,
            maxOutputTokens: 2000,
            signal: AbortSignal.timeout(90000),
          });
        const result = {
          mode,
          repeat: i,
          decisionError: output.decisionError ?? null,
          schemaValid: !output.decisionError && qualifyOutput(detail.request.schema, messages, output.decision).valid,
          providerMetadata: output.providerMetadata,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
        };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    await l.finishDiagnostic(diagnostic);
    await writeFile(
      `${out}/diagnostic-result.json`,
      JSON.stringify({ diagnostic, source, results, aggregate: await l.summary(p) }, null, 2),
      { mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    await writeFile(
      `${out}/diagnostic-error.json`,
      JSON.stringify(
        { code: error instanceof Error ? error.message : "DIAGNOSTIC_FAILED", aggregate: await l.summary(p) },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    throw error;
  } finally {
    await l.close();
  }
}
