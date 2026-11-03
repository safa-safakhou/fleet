import { expect, test } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { ModelAdmission } from "../../src/platform/admission.js";
import { platformFixture } from "../platform-helpers.js";

test("reported native abort usage survives cancellation checks and cannot execute an action", async () => {
  const f = await platformFixture();
  const stop = new AbortController();
  try {
    await f.enqueue();
    const claim = await f.claim();
    const provider: ModelPort = {
      tracksDispatch: true,
      async decide(request) {
        await request.onDispatch?.();
        stop.abort(new FleetError("HOST_STOPPED"));
        return { decision: null, decisionError: "MODEL_ABORTED", inputTokens: 17, outputTokens: 3 };
      },
    };
    const admission = new ModelAdmission(f.store, f.tasks, provider, f.route);
    await expect(admission.decide(claim, f.request(stop.signal))).rejects.toMatchObject({ code: "HOST_STOPPED" });
    expect(
      (
        await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger WHERE turn_id=$1", [
          claim.turn.id,
        ])
      ).rows,
    ).toEqual([{ status: "reported", input_tokens: "17", output_tokens: "3" }]);
    expect(
      (await f.pool.query("SELECT unknown_usage FROM turns WHERE id=$1", [claim.turn.id])).rows[0].unknown_usage,
    ).toBe(false);
    expect((await f.pool.query("SELECT 1 FROM platform_commands WHERE turn_id=$1", [claim.turn.id])).rowCount).toBe(0);
    expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
  } finally {
    await f.pool.end();
  }
});
