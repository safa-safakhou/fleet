import pg from "pg";
import { assertFixtureUrl } from "../scripts/test-architecture-offline.js";

async function readOwner(url: string): Promise<string | undefined> {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 1000 });
  try {
    return (await pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows[0]?.nonce;
  } finally {
    await pool.end();
  }
}
export async function assertOwnedFixture(url: string, nonce: string, read = readOwner): Promise<void> {
  assertFixtureUrl(url);
  if (!/^[a-f0-9]{64}$/.test(nonce) || (await read(url)) !== nonce) throw Error("FIXTURE_OWNERSHIP_MISMATCH");
}
if (process.env.FLEET_ARCHITECTURE_TEST === "1") {
  const nonce = process.env.FLEET_ARCHITECTURE_NONCE ?? "";
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", nonce);
  await assertOwnedFixture(process.env.TEST_DATABASE_URL ?? "", nonce);
}
