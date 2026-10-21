import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { skillLibraryFixture } from "../fixtures/skills/library.js";

let s: Awaited<ReturnType<typeof skillLibraryFixture>>;
afterEach(async () => {
  await s?.f.close();
});
it("authenticates bounded read-only private inspection and withholds revoked or shareable private details", async () => {
  s = await skillLibraryFixture();
  const f = s.f,
    ref = await s.repository.propose(s.scope, s.body),
    state = new SpecialistRepository(f.store, s.scope),
    secret = "private-peer-text-<script>alert(1)</script>";
  await state.accept(s.scope, {
    expectedVersion: 0,
    operationId: randomUUID(),
    envelope: {
      goals: [],
      memories: [
        {
          id: randomUUID(),
          kind: "interpretation",
          text: secret,
          evidenceIds: s.body.evidence.sourceIds,
          uncertainty: "Untrusted peer statement",
        },
      ],
      predictions: [],
      plan: secret,
      deliveryIds: [],
      messages: [],
      wakeConditions: [],
    },
  });
  const base = `/instances/${encodeURIComponent(s.scope.instanceId)}`;
  expect((await f.app.inject({ url: `/api${base}/specialists` })).statusCode).toBe(401);
  const before = (
    await f.pool.query(
      "SELECT (SELECT count(*) FROM compute_ledger)::int calls,(SELECT count(*) FROM platform_commands)::int commands,(SELECT count(*) FROM specialist_updates)::int updates",
    )
  ).rows;
  const result = await f.api<Record<string, unknown>>(`${base}/specialists`),
    skills = await f.api<Record<string, unknown>>(`${base}/skills`);
  expect(JSON.stringify(result)).toContain(secret);
  expect(JSON.stringify(skills)).toContain(ref.digest);
  expect((await f.api<{ instances: unknown[] }>("/instances")).instances).toHaveLength(1);
  const shared = await f.api(`${base}/specialists?scope=shareable`);
  expect(JSON.stringify(shared)).not.toContain(secret);
  expect(shared).not.toHaveProperty("bindingId");
  expect(shared).not.toHaveProperty("participants");
  expect(
    (
      await f.pool.query(
        "SELECT (SELECT count(*) FROM compute_ledger)::int calls,(SELECT count(*) FROM platform_commands)::int commands,(SELECT count(*) FROM specialist_updates)::int updates",
      )
    ).rows,
  ).toEqual(before);
  const source = s.body.evidence.sourceIds[0],
    row = (await f.pool.query("SELECT detail_cipher FROM architecture_scoped_evidence WHERE id=$1", [source])).rows[0],
    aad = `architecture-evidence:${s.scope.instanceId}:${s.scope.bindingId}:${source}`,
    e = f.store.vault.decrypt<Record<string, any>>(row.detail_cipher, aad);
  e.detail.expiresAt = new Date(f.now().getTime() - 1).toISOString();
  await f.pool.query("UPDATE architecture_scoped_evidence SET detail_cipher=$2 WHERE id=$1", [
    source,
    f.store.vault.encrypt(e, aad),
  ]);
  expect(JSON.stringify(await f.api(`${base}/specialists`))).not.toContain(secret);
  expect(JSON.stringify(await f.api(`${base}/skills`))).not.toContain(s.body.purpose.summary);
  await f.store.consent(f.id, false);
  for (const kind of ["skills", "specialists"]) {
    const withheld = await f.api(`${base}/${kind}`);
    expect(withheld).toMatchObject({ consent: false });
    expect(JSON.stringify(withheld)).not.toContain(secret);
    expect(withheld).not.toHaveProperty("participants");
    expect(withheld).not.toHaveProperty("skills");
  }
});
