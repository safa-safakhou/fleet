import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { FleetError } from "../src/domain.js";
import { fullQualificationSummary, prepareFullQualification, runFullQualification } from "../src/full-qualification.js";
import { PactQualificationFixtures } from "../src/games/pact/qualification.js";
import { LayaRecall, layaRevision } from "../src/laya.js";
import { HttpModel } from "../src/model.js";
import { QualificationLedger } from "../src/qualification-run.js";

const args = process.argv.slice(2),
  planPath = args[0];
if (!planPath || args.some((arg, i) => i > 0 && arg !== "--execute-approved"))
  throw new FleetError("QUALIFICATION_USAGE");
const prepared = prepareFullQualification(JSON.parse(await readFile(planPath, "utf8")));
console.log(
  JSON.stringify({
    mode: args.includes("--execute-approved") ? "execute-approved" : "review-only",
    digest: prepared.digest,
    approval: prepared.approval,
    plans: prepared.plans.map((p) => ({ id: p.plan.id, thinking: p.plan.model.thinking, digest: p.digest })),
  }),
);
if (args.includes("--execute-approved")) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (
    sha !== prepared.approval.sourceCommit ||
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
  )
    throw new FleetError("QUALIFICATION_SOURCE_MISMATCH");
  const keyPath = process.env.FLEET_QUALIFICATION_KEY_FILE,
    db = process.env.FLEET_QUALIFICATION_DATABASE_URL,
    evidence = process.env.FLEET_QUALIFICATION_EVIDENCE_DIR;
  if (!keyPath || !db || !evidence) throw new FleetError("QUALIFICATION_PRIVATE_STORAGE_REQUIRED");
  for (const file of [keyPath, planPath, evidence])
    if ((await stat(file)).mode & 0o077) throw new FleetError("QUALIFICATION_PRIVATE_STORAGE_REQUIRED");
  const get = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new FleetError("QUALIFICATION_METADATA_FAILED");
    return response.json();
  };
  const version = await get(`${prepared.approval.endpoint}/api/version`),
    tags = await get(`${prepared.approval.endpoint}/api/tags`),
    loaded = await get(`${prepared.approval.endpoint}/api/ps`),
    helper = await get(`${prepared.approval.helperEndpoint}/health`);
  if (
    version.version !== "0.35.1" ||
    loaded.models?.length ||
    !tags.models?.some(
      (m: { name: string; digest: string }) =>
        m.name === "nemotron-3-nano:4b" && m.digest === prepared.approval.modelDigest,
    )
  )
    throw new FleetError("QUALIFICATION_PROVIDER_PIN_MISMATCH");
  if (
    helper.runtime !== "0.4.6" ||
    helper.revision !== layaRevision ||
    helper.certificate !== "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc"
  )
    throw new FleetError("QUALIFICATION_HELPER_PIN_MISMATCH");
  const manifest = {
    observedAt: new Date().toISOString(),
    fleetCommit: sha,
    planDigest: prepared.digest,
    scope: prepared.approval.scope,
    version,
    tags,
    loaded,
    helper,
    contractsDigest: createHash("sha256")
      .update(await readFile("vendor/pact-actions.json"))
      .digest("hex"),
  };
  const ledger = await QualificationLedger.open(db, (await readFile(keyPath, "utf8")).trim());
  try {
    await writeFile(`${evidence}/preflight.json`, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" });
    const result = await runFullQualification(ledger, prepared, {
      model: new HttpModel({ ollama: prepared.approval.endpoint }, undefined),
      recall: new LayaRecall(prepared.approval.helperEndpoint),
      fixtures: (plan) => PactQualificationFixtures.create(ledger, plan),
      progress: (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })),
    });
    await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ final: result }));
  } catch (error) {
    await writeFile(
      `${evidence}/result.json`,
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : "QUALIFICATION_FAILED",
          ...(await fullQualificationSummary(ledger, prepared)),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    throw error;
  } finally {
    await ledger.close();
  }
}
