import { beforeAll } from "vitest";
import { assertOwnedFixture } from "../architecture-fixture.js";

beforeAll(() =>
  assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? ""),
);

import fc from "fast-check";
import { expect, test } from "vitest";
import { StepJournal } from "../../src/research/broker/steps.js";
import { digest } from "../../src/research/contracts.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";
import { propertyOptions, propertySelected } from "./options.js";
import { LedgerModel } from "./research-ledger.model.js";

const choices = ["reserve", "known", "unknown", "duplicate", "conflict", "cancel", "expire", "late"] as const;
test.skipIf(!propertySelected("ledger"))(
  "stateful histories conserve native reservations and fence duplicate work",
  async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom(...choices), { minLength: 1, maxLength: 50 }), async (history) => {
        const f = await platformFixture();
        try {
          await f.enqueue();
          const claim = await f.claim();
          const input = manifestInput();
          input.environment.bindingId = claim.bindingId;
          input.profile = claim.profile;
          const manifest = compileManifest(input, capability);
          await new ManifestRepository(f.pool).save(manifest.manifest);
          const journal = new StepJournal(f.store, f.tasks),
            scope = await journal.open(claim, "run", "property-op", manifest.digest),
            key = {
              operationId: scope.operationId,
              operationEpoch: scope.operationEpoch,
              logicalStepId: "one-logical-call",
            },
            model = new LedgerModel();
          for (const action of history) {
            if (action === "reserve" && model.live && !model.begun) {
              expect((await journal.begin(scope, key, digest({ question: "fixture" }))).disposition).toBe("new");
              model.begun = true;
              model.allocationId = await f.store.reserveCall(claim.turn);
              model.calls = 1;
              model.effectCount++;
            } else if (action === "known" && model.live && model.begun && !model.known && !model.unknown) {
              await f.store.recordUsage(model.requireAllocation(), 3, 4);
              await journal.complete(scope, key, {
                status: "completed",
                allocationId: model.allocationId,
                usage: { inputTokens: "3", outputTokens: "4" },
              });
              model.known = true;
            } else if (action === "unknown" && model.begun && !model.known && !model.unknown) {
              await f.store.recordUsage(model.requireAllocation(), null, null);
              await journal.complete(scope, key, { status: "unknown", allocationId: model.allocationId, usage: null });
              model.unknown = true;
            } else if (action === "duplicate" && model.begun && model.live) {
              expect((await journal.begin(scope, key, digest({ question: "fixture" }))).disposition).toBe("existing");
            } else if (action === "conflict" && model.begun && model.live) {
              await expect(journal.begin(scope, key, digest({ question: "different" }))).rejects.toThrow(
                "STEP_INPUT_CONFLICT",
              );
            } else if (action === "cancel" && model.live) {
              await f.tasks.cancel(claim);
              model.live = false;
            } else if (action === "expire" && model.live) {
              f.advance(121000);
              model.live = false;
            } else if (action === "late" && model.unknown) {
              await f.store.recordUsage(model.requireAllocation(), 3, 4);
            }
            if (!model.live) await expect(journal.begin(scope, key, digest({ question: "fixture" }))).rejects.toThrow();
            const rows = (
              await f.pool.query("SELECT tokens::text,status FROM compute_ledger WHERE turn_id=$1", [claim.turn.id])
            ).rows;
            model.check(rows);
            expect(
              (
                await f.pool.query("SELECT count(*)::int n FROM research_steps WHERE operation_id=$1", [
                  scope.operationId,
                ])
              ).rows[0].n,
            ).toBe(model.begun ? 1 : 0);
          }
        } finally {
          await f.pool.end();
        }
      }),
      propertyOptions("ledger"),
    );
  },
  1_800_000,
);
test("the independent oracle detects refund-on-unknown and fast-check shrinks its counterexample", () => {
  const result = fc.check(
    fc.property(fc.integer({ min: 1, max: 39999 }), (value) => {
      const model = new LedgerModel();
      model.calls = 1;
      model.unknown = true;
      model.check([{ tokens: String(value), status: "unknown" }]);
    }),
    { seed: 20261030 },
  );
  expect(result.failed).toBe(true);
  expect(result.counterexample).toEqual([1]);
  expect(result.counterexamplePath).toBeTruthy();
});
