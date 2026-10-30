import { assertOwnedFixture } from "./architecture-fixture.js";
import { platformFixture } from "./platform-helpers.js";
export async function researchFixture() {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture();
  await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [f.group.id]);
  await f.enqueue();
  const claim = await f.claim();
  return { ...f, claim };
}
