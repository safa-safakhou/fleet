import { expect, it } from "vitest";
import { ModelAdmission } from "../../src/platform/admission.js";
import { platformFixture } from "../platform-helpers.js";

it("reviews each known response after usage settlement and blocks correction without making usage unknown", async () => {
  const f = await platformFixture();
  try {
    await f.enqueue();
    const claim = await f.claim();
    let calls = 0,
      reviews = 0;
    const admission = new ModelAdmission(
      f.store,
      f.tasks,
      {
        tracksDispatch: true,
        decide: async (request) => {
          calls++;
          await request.onDispatch?.();
          return { decision: null, decisionError: "INVALID_MODEL_OUTPUT", inputTokens: 11, outputTokens: 7 };
        },
      },
      f.route,
    ).reviewed(async (_claim, result) => {
      reviews++;
      const row = (
        await f.pool.query("SELECT status,input_tokens::int,output_tokens::int FROM compute_ledger WHERE id=$1", [
          result.allocationId,
        ])
      ).rows[0];
      expect(row).toMatchObject({ status: "reported", input_tokens: 11, output_tokens: 7 });
      throw Error("CRITICAL_CLAIM");
    });
    await expect(admission.decide(claim, f.request())).rejects.toThrow("CRITICAL_CLAIM");
    expect(calls).toBe(1);
    expect(reviews).toBe(1);
    const rows = (
      await f.pool.query("SELECT status,input_tokens::int,output_tokens::int FROM compute_ledger WHERE turn_id=$1", [
        claim.turn.id,
      ])
    ).rows;
    expect(rows).toEqual([{ status: "reported", input_tokens: 11, output_tokens: 7 }]);
  } finally {
    await f.pool.end();
  }
});
