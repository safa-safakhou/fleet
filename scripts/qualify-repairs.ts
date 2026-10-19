import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { FleetError } from "../src/domain.js";
import { PactQualificationFixtures } from "../src/games/pact/qualification.js";
import { LayaRecall, layaRevision } from "../src/laya.js";
import { HttpModel } from "../src/model.js";
import { prepareQualification, QualificationLedger } from "../src/qualification-run.js";
import { RepairApproval, RepairQualification, runRepairQualification } from "../src/repair-qualification.js";

const [parentPath, approvalPath, ...args] = process.argv.slice(2);
if (!parentPath || !approvalPath || args.some((a) => a !== "--execute-approved")) throw new FleetError("REPAIR_USAGE");
const parent = prepareQualification(JSON.parse(await readFile(parentPath, "utf8"))),
  approval = RepairApproval.parse(JSON.parse(await readFile(approvalPath, "utf8")));
console.log(
  JSON.stringify({
    mode: args.includes("--execute-approved") ? "execute-approved" : "review-only",
    parent: parent.plan.id,
    approval,
  }),
);
if (args.includes("--execute-approved")) {
  const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (source !== approval.sourceCommit || execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
    throw new FleetError("REPAIR_SOURCE_MISMATCH");
  const db = process.env.FLEET_QUALIFICATION_DATABASE_URL,
    key = process.env.FLEET_QUALIFICATION_KEY_FILE,
    out = process.env.FLEET_QUALIFICATION_EVIDENCE_DIR;
  if (!db || !key || !out) throw new FleetError("REPAIR_PRIVATE_STORAGE_REQUIRED");
  for (const file of [parentPath, approvalPath, key, out])
    if ((await stat(file)).mode & 0o077) throw new FleetError("REPAIR_PRIVATE_STORAGE_REQUIRED");
  const get = async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!r.ok) throw new FleetError("REPAIR_METADATA_FAILED");
    return r.json();
  };
  const version = await get(`${parent.plan.endpoint}/api/version`),
    tags = await get(`${parent.plan.endpoint}/api/tags`),
    loaded = await get(`${parent.plan.endpoint}/api/ps`),
    helper = await get(`${parent.plan.helperEndpoint}/health`);
  if (
    version.version !== "0.35.1" ||
    !tags.models?.some(
      (m: { name: string; digest: string }) =>
        m.name === parent.plan.model.model && m.digest === parent.plan.modelDigest,
    ) ||
    loaded.models?.length
  )
    throw new FleetError("REPAIR_PROVIDER_PIN_MISMATCH");
  if (
    helper.runtime !== "0.4.6" ||
    helper.revision !== layaRevision ||
    helper.certificate !== "375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc"
  )
    throw new FleetError("REPAIR_HELPER_PIN_MISMATCH");
  const ledger = await QualificationLedger.open(db, (await readFile(key, "utf8")).trim());
  let recovery: RepairQualification | undefined;
  try {
    await writeFile(
      `${out}/preflight.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          source,
          parentDigest: parent.digest,
          approval,
          version,
          tags,
          loaded,
          helper,
          contractsDigest: createHash("sha256")
            .update(await readFile("vendor/pact-actions.json"))
            .digest("hex"),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    recovery = await RepairQualification.create(ledger, parent, approval);
    const result = await runRepairQualification(recovery, {
      model: new HttpModel({ ollama: parent.plan.endpoint }, undefined),
      recall: new LayaRecall(parent.plan.helperEndpoint),
      fixtures: (thinking) => PactQualificationFixtures.create(ledger, parent, thinking, approval.deadlineAt),
      progress: (event) => {
        const { modes, ...rest } = event;
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            ...rest,
            modes: (modes as { results: unknown }[]).map(({ results: _results, ...summary }) => summary),
          }),
        );
      },
    });
    await writeFile(`${out}/result.json`, JSON.stringify({ source, ...result }, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ final: result }));
  } catch (error) {
    await writeFile(
      `${out}/result.json`,
      JSON.stringify(
        {
          source,
          error: error instanceof Error ? error.message : "REPAIR_FAILED",
          ...(recovery ? await recovery.summary() : { aggregate: await ledger.summary(parent) }),
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
