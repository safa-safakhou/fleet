import { readFile } from "node:fs/promises";
import { safeCode } from "../src/domain.js";
import { prepareWindowsNegotiationRoster } from "./lib/negotiation-prepare.js";
import { PrivateNegotiationReview } from "./lib/negotiation-review-channel.js";
import { OwnedNegotiationManifestSchema } from "./lib/negotiation-windows.js";

try {
  const [command, path, kind, id, verdictPath] = process.argv.slice(2);
  if (!path) throw Error("OWNED_CONTROL_ARGUMENTS");
  if (command === "prepare") {
    if (process.argv.slice(2).length !== 2) throw Error("OWNED_CONTROL_ARGUMENTS");
    process.stdout.write(
      JSON.stringify(await prepareWindowsNegotiationRoster(JSON.parse(await readFile(path, "utf8")))) + "\n",
    );
  } else {
    const m = OwnedNegotiationManifestSchema.parse(JSON.parse(await readFile(path, "utf8"))),
      protocol = JSON.parse(await readFile(`${m.privateRoot}/protocol.json`, "utf8"));
    const channel = new PrivateNegotiationReview(
      `${m.privateRoot}/reviews`,
      (await readFile(m.reviewKeyRef, "utf8")).trim(),
      protocol.batchNonce,
    );
    if (!kind || !id) throw Error("OWNED_CONTROL_ARGUMENTS");
    const request = await channel.inspectWhenPresent(kind, id, Date.now() + 2000);
    if (command === "review-read" && !verdictPath) process.stdout.write(JSON.stringify(request) + "\n");
    else if (command === "review-write" && verdictPath) {
      await channel.respond(kind, id, request.digest, JSON.parse(await readFile(verdictPath, "utf8")));
      process.stdout.write("REVIEW_RECORDED\n");
    } else throw Error("OWNED_CONTROL_ARGUMENTS");
  }
} catch (error) {
  process.stderr.write(`${safeCode(error)}\n`);
  process.exitCode = 1;
}
