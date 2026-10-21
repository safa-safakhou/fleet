import { afterEach, expect, it } from "vitest";
import { QualificationLedger, qualificationDatabase } from "../../src/qualification-run.js";
import { fixture, key, testUrl } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("rejects retained targets and wrong nonce before qualification DDL, while preserving production port validation", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const beforeRelation = (await f.pool.query("SELECT to_regclass('qualification_runs') AS relation")).rows[0].relation;
  const beforeCount = beforeRelation
    ? (await f.pool.query("SELECT count(*) n FROM qualification_runs")).rows[0].n
    : "0";
  const nonce = process.env.FLEET_ARCHITECTURE_NONCE!;
  const wrong = (nonce[0] === "0" ? "1" : "0") + nonce.slice(1);
  await expect(
    QualificationLedger.openOwnedFixture("postgres://example@127.0.0.1:5436/fleet_qualification", key, nonce),
  ).rejects.toThrow("OWNED_QUALIFICATION_FIXTURE_REQUIRED");
  await expect(QualificationLedger.openOwnedFixture(testUrl, key, wrong)).rejects.toThrow(
    "OWNED_QUALIFICATION_FIXTURE_REQUIRED",
  );
  expect((await f.pool.query("SELECT to_regclass('qualification_runs') AS relation")).rows[0].relation).toBe(
    beforeRelation,
  );
  expect(() => qualificationDatabase(testUrl)).toThrow("ISOLATED_QUALIFICATION_DATABASE_REQUIRED");
  const ledger = await QualificationLedger.openOwnedFixture(testUrl, key, nonce);
  await ledger.close();
  expect((await f.pool.query("SELECT count(*) n FROM qualification_runs")).rows[0].n).toBe(beforeCount);
  expect((await f.pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows[0].nonce).toBe(nonce);
});
