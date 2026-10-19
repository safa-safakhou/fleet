import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { buildRecallCases, type RecallPair } from "../src/cognition-diagnostic-cases.js";
import { DiagnosticJournal, diagnosticApproval } from "../src/cognition-diagnostic-journal.js";
import { registerDiagnostic } from "../src/cognition-diagnostic-registration.js";
import { runCognitionDiagnostics } from "../src/cognition-diagnostic-run.js";
import { connect, migrate } from "../src/db.js";
import { FleetError } from "../src/domain.js";
import { DiagnosticEpisodes } from "../src/games/pact/cognition-diagnostics.js";
import { HttpModel } from "../src/model.js";
import { qualificationDatabase, qualificationModelDigest } from "../src/qualification-run.js";
import { Store } from "../src/store.js";
import { Vault } from "../src/vault.js";

const [path, flag, ...extra] = process.argv.slice(2);
if (!path || extra.length || (flag && flag !== "--execute-approved")) throw new FleetError("DIAGNOSTIC_USAGE");
const approval = diagnosticApproval(JSON.parse(await readFile(path, "utf8")));
console.log(JSON.stringify({ mode: flag ? "execute-approved" : "review-only", approval }));
if (flag) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (sha !== approval.sourceCommit || execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
    throw new FleetError("DIAGNOSTIC_SOURCE_MISMATCH");
  const key = process.env.FLEET_QUALIFICATION_KEY_FILE,
    dir = process.env.FLEET_QUALIFICATION_EVIDENCE_DIR,
    db = process.env.FLEET_QUALIFICATION_DATABASE_URL;
  if (!key || !dir || !db) throw new FleetError("DIAGNOSTIC_PRIVATE_STORAGE_REQUIRED");
  for (const f of [path, key, dir, `${dir}/recall-pairs.json`])
    if ((await stat(f)).mode & 0o077) throw new FleetError("DIAGNOSTIC_PRIVATE_STORAGE_REQUIRED");
  const pairs: RecallPair[] = JSON.parse(await readFile(`${dir}/recall-pairs.json`, "utf8")),
    frozen = JSON.parse(await readFile("laya-service/recall-validation.json", "utf8")),
    cases = buildRecallCases(frozen, pairs);
  const metadata = async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!r.ok) throw new FleetError("DIAGNOSTIC_METADATA_FAILED");
    return r.json();
  };
  const version = await metadata(`${approval.endpoint}/api/version`),
    tags = await metadata(`${approval.endpoint}/api/tags`),
    loaded = await metadata(`${approval.endpoint}/api/ps`),
    helper = await metadata(`${approval.helperEndpoint}/health`);
  if (
    version.version !== "0.35.1" ||
    loaded.models?.length ||
    !tags.models?.some(
      (m: { name: string; digest: string }) => m.name === "nemotron-3-nano:4b" && m.digest === qualificationModelDigest,
    )
  )
    throw new FleetError("DIAGNOSTIC_MODEL_PIN");
  if (
    helper.runtime !== "0.4.6" ||
    helper.revision !== "e929ae5cf69bc34259cd2f95c9e91145b818b1f0" ||
    helper.certificate !== "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc"
  )
    throw new FleetError("DIAGNOSTIC_HELPER_PIN");
  const pool = connect(qualificationDatabase(db)),
    vault = new Vault((await readFile(key, "utf8")).trim());
  let journal: DiagnosticJournal | undefined;
  try {
    await migrate(pool);
    await writeFile(
      `${dir}/preflight.json`,
      JSON.stringify(
        {
          sha,
          approval,
          version,
          tags,
          loaded,
          helper,
          casesDigest: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    await registerDiagnostic(pool, approval, `${dir}/journal.jsonl`);
    journal = await DiagnosticJournal.create(`${dir}/journal.jsonl`, approval, vault);
    const result = await runCognitionDiagnostics(
      journal,
      new DiagnosticEpisodes(new Store(pool, vault), approval.deadlineAt, approval.id),
      new HttpModel({ ollama: approval.endpoint }, undefined),
      cases,
      fetch,
      async (event) => {
        const line = JSON.stringify({ at: new Date().toISOString(), ...event });
        await appendFile(`${dir}/progress.jsonl`, `${line}\n`, { mode: 0o600 });
        console.log(line);
      },
    );
    await writeFile(`${dir}/result.json`, JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
  } catch (e) {
    await writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        { code: e instanceof Error ? e.message : "DIAGNOSTIC_FAILED", summary: journal?.summary() },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    throw e;
  } finally {
    if (journal) {
      await journal.close();
      console.log(JSON.stringify({ final: journal.summary() }));
    }
    await pool.end();
  }
}
