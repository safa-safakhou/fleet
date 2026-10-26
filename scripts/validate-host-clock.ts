import { readFile } from "node:fs/promises";
import { assertFreshHostClock, assessHostClock, currentWindowsClock } from "./lib/host-clock.js";

const path = process.argv[2];
if (!path) throw Error("CLOCK_EVIDENCE_FILE_REQUIRED");
const text = await readFile(path, "utf8");
if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Error("CLOCK_EVIDENCE_TOO_LARGE");
const evidence = JSON.parse(text),
  assessment = assessHostClock(evidence);
if (!assessment.passed) {
  console.log(JSON.stringify(assessment));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(assertFreshHostClock(evidence, await currentWindowsClock())));
}
