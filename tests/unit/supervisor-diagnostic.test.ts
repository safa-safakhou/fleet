import { expect, it } from "vitest";
import { supervisorDiagnostic } from "../../scripts/lib/supervisor-diagnostic.js";

it("retains the original failure classification and location without private error text", () => {
  const e = Object.assign(new TypeError("postgres://PRIVATE_PASSWORD secret SQL"), {
    code: "EIO",
    cause: Error("HEARTBEAT_WRITE_FAILED"),
  });
  e.stack = "TypeError: PRIVATE_PASSWORD\n at save (/home/operator/repos/fleet/scripts/lib/run-control-io.ts:42:8)";
  const detail = supervisorDiagnostic(e, "poll");
  expect(detail).toEqual({
    stage: "poll",
    code: "EIO",
    errorType: "TypeError",
    source: ["scripts/lib/run-control-io.ts:42:8"],
    causeCode: "HEARTBEAT_WRITE_FAILED",
  });
  expect(JSON.stringify(detail)).not.toMatch(/PRIVATE|postgres|operator/);
});
