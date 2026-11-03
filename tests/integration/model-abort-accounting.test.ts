import { expect, test } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { ModelAdmission } from "../../src/platform/admission.js";
import { SettledModelAttemptFailure } from "../../src/platform/model-attempt-failure.js";
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

test.each([false, true])(
  "feedback distinguishes reported deadline settlement from a retained unknown allocation (prior unknown=%s)",
  async (priorUnknown) => {
    const f = await platformFixture();
    try {
      await f.enqueue();
      const claim = await f.claim();
      let calls = 0;
      const provider: ModelPort = {
        tracksDispatch: true,
        async decide(request) {
          calls++;
          await request.onDispatch?.();
          if (priorUnknown) {
            const id = (await f.pool.query("SELECT id FROM compute_ledger WHERE turn_id=$1", [claim.turn.id])).rows[0]
              .id;
            await f.store.recordUsage(id, null, null);
          }
          f.advance(91000);
          return { decision: null, decisionError: "MODEL_ABORTED", inputTokens: 17, outputTokens: 3 };
        },
      };
      const admission = new ModelAdmission(f.store, f.tasks, provider, f.route);
      const outcome = await admission.decideWithFeedback(claim, f.request(new AbortController().signal), {
        maxAttempts: 3,
        validate: () => null,
      });
      expect(calls).toBe(1);
      expect(outcome.result).toBeNull();
      expect(outcome.error).toBe("MODEL_DEADLINE_EXCEEDED");
      expect(outcome.stopReason).toBe("attempt_error");
      expect(outcome.metrics).toMatchObject({
        attempts: 1,
        unknownUsageCalls: priorUnknown ? 1 : 0,
        inputTokens: priorUnknown ? null : 17,
        outputTokens: priorUnknown ? null : 3,
      });
      const row = (
        await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger WHERE turn_id=$1", [
          claim.turn.id,
        ])
      ).rows[0];
      expect(row).toEqual(
        priorUnknown
          ? { status: "unknown", input_tokens: null, output_tokens: null }
          : { status: "reported", input_tokens: "17", output_tokens: "3" },
      );
      expect((await f.pool.query("SELECT 1 FROM platform_commands WHERE turn_id=$1", [claim.turn.id])).rowCount).toBe(
        0,
      );
      expect((await f.pool.query("SELECT 1 FROM model_capacity_leases")).rowCount).toBe(0);
    } finally {
      await f.pool.end();
    }
  },
);

test("a provider-thrown settled wrapper cannot certify an unknown native allocation", async () => {
  const f = await platformFixture();
  try {
    await f.enqueue();
    const claim = await f.claim();
    let calls = 0;
    const provider: ModelPort = {
      tracksDispatch: true,
      async decide(request) {
        calls++;
        await request.onDispatch?.();
        const allocationId = (await f.pool.query("SELECT id FROM compute_ledger WHERE turn_id=$1", [claim.turn.id]))
          .rows[0].id;
        throw new SettledModelAttemptFailure("MODEL_DEADLINE_EXCEEDED", {
          allocationId,
          inputTokens: 17,
          outputTokens: 3,
        });
      },
    };
    const outcome = await new ModelAdmission(f.store, f.tasks, provider, f.route).decideWithFeedback(
      claim,
      f.request(new AbortController().signal),
      { maxAttempts: 3, validate: () => null },
    );
    expect(calls).toBe(1);
    expect(outcome.metrics).toMatchObject({ unknownUsageCalls: 1, inputTokens: null, outputTokens: null });
    expect(
      (
        await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger WHERE turn_id=$1", [
          claim.turn.id,
        ])
      ).rows[0],
    ).toEqual({ status: "unknown", input_tokens: null, output_tokens: null });
  } finally {
    await f.pool.end();
  }
});
