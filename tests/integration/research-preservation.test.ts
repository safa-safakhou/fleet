import { expect, test } from "vitest";
import { rehearseMigration } from "../../scripts/test-research-migration.js";

test("preserves_pre041_synthetic_history through twice-applied migrations and SQL plus ciphertext restore", async () => {
  const report = await rehearseMigration();
  expect(report.status).toBe("passed");
  expect(report.before.digest).toBe(report.after.digest);
  expect(report.before.digest).toBe(report.restoredLegacy.digest);
  expect(report.full.digest).toBe(report.restoredFull.digest);
  expect(report.unknown).toEqual({ count: 1, tokens: "40000" });
  expect(report.archive).toMatchObject({ status: "verified", events: 2, artifacts: 1, gaps: 0 });
  expect(report.rollback).toEqual({
    pre048Binary: "incompatible",
    required: "stop-fence-drain; retain new rows; use tested ownership-aware build",
  });
  expect(report.tables).toBeGreaterThan(40);
}, 120000);
