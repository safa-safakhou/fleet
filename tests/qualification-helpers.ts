import { QualificationLedger } from "../src/qualification-run.js";
/** Qualification fixtures never fall back to retained port 5436. */
export async function openQualificationFixture(key: string) {
  const url = process.env.FLEET_TEST_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !url || !nonce)
    throw Error("EXPLICIT_OWNED_QUALIFICATION_FIXTURE_REQUIRED");
  return QualificationLedger.openOwnedFixture(url, key, nonce);
}
