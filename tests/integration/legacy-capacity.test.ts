import { afterEach, expect, it, vi } from "vitest";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { RouteCapacity } from "../../src/platform/admission.js";
import { currentLegacyClaim } from "../../src/platform/profiles.js";
import golden from "../fixtures/legacy-read-progress-20261026.json" with { type: "json" };
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { modelInputDigest } from "../legacy-parity.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  vi.useRealTimers();
});
it.each([false, true])(
  "preserves pinned inputs and one original allocation through shared capacity, cognition %s",
  async (cognition) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T12:00:00.000Z"));
    const f = await fixture();
    close = () => f.pool.end();
    const id = await ready(f.store, 1);
    await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb,observation_consent=true WHERE id=$1", [
      id,
      JSON.stringify(cognition ? { cognition: "llm-centered-v1" } : {}),
    ]);
    const claim = await f.store.claim("legacy-fixture");
    if (!claim) throw Error("MISSING_CLAIM");
    const model = new FakeModel(),
      capacity = new RouteCapacity(f.store, () => ({ key: "legacy-capacity-parity", capacity: 1 })),
      game = new FakeGame(claim);
    await new LegacyEngineBridge(
      f.store,
      capacity.wrap(model, currentLegacyClaim),
      async () => game,
      true,
      pactAdapter,
    ).run(claim);
    expect(modelInputDigest(model, claim)).toBe(golden.cases[cognition ? 1 : 0].modelInputDigest);
    expect(model.inputs).toHaveLength(1);
    expect(
      (await f.pool.query("SELECT status,tokens::text FROM compute_ledger WHERE turn_id=$1", [claim.id])).rows,
    ).toEqual([{ status: "reported", tokens: "40000" }]);
    expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
    expect(currentLegacyClaim()).toBeUndefined();
  },
);
