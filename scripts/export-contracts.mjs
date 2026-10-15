// Explicit operator build step only. Runtime never imports the game repository or database.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "../node_modules/zod/index.js";

const check = process.argv[2] === "--check";
const path = process.argv[check ? 3 : 2];
if (!path) throw Error("Supply the reviewed PACT contracts dist/index.js path");
const contracts = await import(path);
const names = [
  "GameActionV2Schema",
  "CourtCommandSchema",
  "PoliticsCommandSchema",
  "SealCommandSchema",
  "SocialCommandSchema",
  "ChronicleCommandSchema",
];
const families = names.map((name) => ({
  name,
  version: name === "GameActionV2Schema" ? "pact.command.v2" : contracts[name].shape.schemaVersion.value,
  schema: z.toJSONSchema(name === "GameActionV2Schema" ? contracts[name] : contracts[name].shape.action, {
    target: "draft-7",
    unrepresentable: "any",
  }),
}));
const payload = JSON.stringify(families);
if (check) {
  const actions = JSON.parse(await readFile("vendor/pact-actions.json", "utf8"));
  const observations = JSON.parse(await readFile("vendor/pact-observations.json", "utf8"));
  const reads = [contracts.pactObservationSectionTool];
  if (
    JSON.stringify(actions.families) !== payload ||
    actions.sha256 !== createHash("sha256").update(payload).digest("hex") ||
    JSON.stringify(observations.reads) !== JSON.stringify(reads) ||
    observations.sha256 !== createHash("sha256").update(JSON.stringify(reads)).digest("hex")
  )
    throw Error("REVIEWED_CONTRACTS_DIFFER");
  console.log("Reviewed action and observation contracts match the explicit built PACT source; no files changed.");
  process.exit(0);
}
await mkdir("vendor", { recursive: true });
await writeFile(
  "vendor/pact-actions.json",
  JSON.stringify(
    {
      source: "PACT reviewed public action contracts, 11 October 2026",
      sha256: createHash("sha256").update(payload).digest("hex"),
      families,
    },
    null,
    2,
  ) + "\n",
);

if (contracts.pactObservationSectionTool) {
  const reads = [contracts.pactObservationSectionTool];
  await writeFile(
    "vendor/pact-observations.json",
    `${JSON.stringify({ source: "PACT reviewed scoped observation contract, 15 October 2026", sha256: createHash("sha256").update(JSON.stringify(reads)).digest("hex"), reads }, null, 2)}\n`,
  );
}
