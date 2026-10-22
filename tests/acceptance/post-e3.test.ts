import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { readNegotiationEvidence } from "../../../pact/tests/evaluation/negotiation-outcome.js";
import {
  prepareOwnedRC1World,
  prepareOwnedRC2World,
  prepareOwnedRC3World,
  prepareOwnedRC4World,
  prepareOwnedRC5World,
  prepareOwnedRC6World,
  prepareOwnedRC7World,
  prepareOwnedRC8World,
  prepareOwnedRC9World,
  prepareOwnedRC10World,
  prepareOwnedRC11World,
  prepareOwnedRC12World,
} from "../../../pact/tests/evaluation/post-e3-owned-world.js";
import {
  executeOwnedRC2Protocol,
  prepareOwnedRC3Cohort,
  prepareOwnedRC4Cohort,
  prepareOwnedRC5Cohort,
  prepareOwnedRC6Cohort,
  prepareOwnedRC7Cohort,
  prepareOwnedRC8Cohort,
  prepareOwnedRC9Cohort,
  prepareOwnedRC10Cohort,
  prepareOwnedRC11Cohort,
  prepareOwnedRC12Cohort,
} from "../../scripts/lib/post-e3-owned-run.js";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";
import {
  prepareRC2Protocol,
  prepareRC3Protocol,
  prepareRC4Protocol,
  prepareRC5Protocol,
  prepareRC6Protocol,
  prepareRC7Protocol,
  prepareRC8Protocol,
  prepareRC9Protocol,
  prepareRC10Protocol,
  prepareRC11Protocol,
  prepareRC12Protocol,
} from "../../src/post-e3-rc2-plan.js";
import { fixture } from "../helpers.js";

it("creates two independent canonical RC1 actors and solo controls without borrowing an old study world", async () => {
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_PAIRED_REQUIRED");
  const protocol = prepareRC1Protocol({
    stage: "R1-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "1".repeat(64),
  });
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (!pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const target = { pactUrl, nonce };
  const secrets = {
    rulesKey: randomBytes(32).toString("base64"),
    tokenKey: randomBytes(32).toString("base64"),
    encryptionKey: randomBytes(32).toString("base64"),
  };
  const world = await prepareOwnedRC1World(target, protocol, protocol.cells[0], { secrets, retention: "preserve" });
  let control: Awaited<ReturnType<typeof prepareOwnedRC1World>> | undefined;
  try {
    control = await prepareOwnedRC1World(target, protocol, protocol.cells[0], {
      secrets,
      retention: "preserve",
      control: true,
    });
    expect(world.players).toHaveLength(2);
    expect(new Set([...world.players, ...control.players].map((p) => p.accountId)).size).toBe(4);
    const evidence = await readNegotiationEvidence(world);
    expect(evidence.cellId).toBe(protocol.cells[0].id);
    expect(evidence.receipts).toHaveLength(0);
    await expect(
      prepareOwnedRC1World(
        target,
        protocol,
        { ...protocol.cells[0], worldSeed: "0".repeat(64) },
        { secrets, retention: "preserve" },
      ),
    ).rejects.toThrow("RC1_UNPLANNED_OR_CHANGED_CELL");
    expect((await world.pool.query("SELECT count(*)::int n FROM negotiation_fixture_commands")).rows[0].n).toBe(0);
  } finally {
    await world.pauseClock();
    await control?.pauseClock();
    await world.disconnect();
    await control?.disconnect();
  }
}, 60000);

it("reopens an exact serialized R2 checkpoint without creating replacement identities or accepting an R1 checkpoint", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const protocol = prepareRC2Protocol({
    stage: "R2-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "1".repeat(64),
  });
  const secrets = {
    rulesKey: randomBytes(32).toString("base64"),
    tokenKey: randomBytes(32).toString("base64"),
    encryptionKey: randomBytes(32).toString("base64"),
  };
  const world = await prepareOwnedRC2World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
  });
  await world.pauseClock("R2_CHECKPOINT_REOPEN");
  const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
  await world.disconnect();
  const reopened = await prepareOwnedRC2World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
    checkpoint,
  });
  try {
    expect(reopened.worldId).toBe(checkpoint.worldId);
    expect(reopened.checkpoint()).toEqual(checkpoint);
    expect((await reopened.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
    expect((await reopened.pool.query("SELECT count(*)::int n FROM negotiation_fixture_commands")).rows[0].n).toBe(0);
    await expect(
      prepareOwnedRC2World({ pactUrl, nonce }, protocol, protocol.cells[0], {
        secrets,
        retention: "preserve",
        checkpoint: { ...checkpoint, schemaVersion: "pact.rc1-owned-world.v1" },
      }),
    ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
  } finally {
    await reopened.disconnect();
  }
}, 60000);

it("prepares the exact RC3 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC3Protocol({
    stage: "R3-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC3World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC3World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC3Cohort(
      f.store,
      world,
      control,
      protocol.cells[0],
      { route: "ollama", model: "authored-fake", thinking: true },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R3_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc3-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC3World({ pactUrl, nonce }, protocol, protocol.cells[0], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      await expect(
        prepareOwnedRC3World({ pactUrl, nonce }, protocol, protocol.cells[0], {
          secrets,
          retention: "preserve",
          checkpoint: { ...checkpoint, schemaVersion: "pact.rc2-owned-world.v1" },
        }),
      ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC4 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC4Protocol({
    stage: "R4-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC4World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC4World({ pactUrl, nonce }, protocol, protocol.cells[0], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC4Cohort(
      f.store,
      world,
      control,
      protocol.cells[0],
      { route: "ollama", model: "authored-fake", thinking: true },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R4_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc4-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC4World({ pactUrl, nonce }, protocol, protocol.cells[0], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of ["pact.rc1-owned-world.v1", "pact.rc2-owned-world.v1", "pact.rc3-owned-world.v1"]) {
        await expect(
          prepareOwnedRC4World({ pactUrl, nonce }, protocol, protocol.cells[0], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC5 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC5Protocol({
    stage: "R5-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC5World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC5World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC5Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "authored-fake", thinking: true },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R5_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc5-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC5World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC5World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC6 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC6Protocol({
    stage: "R6-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC6World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC6World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC6Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "authored-fake", thinking: true },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R6_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc6-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC6World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC6World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC7 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC7Protocol({
    stage: "R7-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC7World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC7World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC7Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "authored-fake", thinking: true },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R7_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc7-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC7World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC7World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC8 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC8Protocol({
    stage: "R8-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC8World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC8World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC8Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "qwen3.5:9b", thinking: false },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R8_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc8-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC8World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
        "pact.rc7-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC8World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC9 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC9Protocol({
    stage: "R9-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC9World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC9World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC9Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "qwen3.5:9b", thinking: false },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R9_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc9-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC9World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
        "pact.rc7-owned-world.v1",
        "pact.rc8-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC9World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC10 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC10Protocol({
    stage: "R10-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC10World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC10World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC10Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "qwen3.5:9b", thinking: false },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R10_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc10-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC10World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
        "pact.rc7-owned-world.v1",
        "pact.rc8-owned-world.v1",
        "pact.rc9-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC10World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC11 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC11Protocol({
    stage: "R11-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC11World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC11World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC11Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "qwen3.5:9b", thinking: false },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R11_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc11-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC11World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
        "pact.rc7-owned-world.v1",
        "pact.rc8-owned-world.v1",
        "pact.rc9-owned-world.v1",
        "pact.rc10-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC11World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);

it("prepares the exact RC12 actor configuration and reopens only its own checkpoint namespace", async () => {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC12Protocol({
    stage: "R12-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "3".repeat(64),
  });
  const secrets = Object.fromEntries(
    ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
  ) as { rulesKey: string; tokenKey: string; encryptionKey: string };
  const world = await prepareOwnedRC12World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
  });
  const control = await prepareOwnedRC12World({ pactUrl, nonce }, protocol, protocol.cells[1], {
    secrets,
    retention: "preserve",
    control: true,
  });
  try {
    const p = await prepareOwnedRC12Cohort(
      f.store,
      world,
      control,
      protocol.cells[1],
      { route: "ollama", model: "qwen3.5:9b", thinking: false },
      nonce,
      "synthetic-evidence",
      "synthetic-key",
    );
    for (const player of world.players) {
      const observed = await world.actor(player.kingdomId).readSelf();
      const objective = JSON.parse(observed?.ambition ?? "null");
      expect(objective).toMatchObject({
        quantityUnit: "whole resource units",
        timeUnit: "GAME hour",
        scope: "supply delivery rates; not communication allowance",
      });
      expect(objective.maximumSendPerHour).toBe(player.role === "A" ? 2 : 1);
      expect(objective).not.toHaveProperty("messagesPerHour");
    }
    const row = (
      await f.pool.query("SELECT architecture_config FROM cohort_engine_profiles WHERE cohort_id=$1", [
        p.binding.cohortId,
      ])
    ).rows[0];
    expect(row.architecture_config).toEqual(protocol.configuration);
    expect((await f.store.cohort(p.binding.cohortId)).interval_minutes).toBe(30);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await world.pauseClock("R12_CHECKPOINT_REOPEN");
    const checkpoint = JSON.parse(JSON.stringify(world.checkpoint()));
    expect(checkpoint.schemaVersion).toBe("pact.rc12-owned-world.v1");
    await world.disconnect();
    const reopened = await prepareOwnedRC12World({ pactUrl, nonce }, protocol, protocol.cells[1], {
      secrets,
      retention: "preserve",
      checkpoint,
    });
    try {
      expect(reopened.checkpoint()).toEqual(checkpoint);
      for (const schemaVersion of [
        "pact.rc1-owned-world.v1",
        "pact.rc2-owned-world.v1",
        "pact.rc3-owned-world.v1",
        "pact.rc4-owned-world.v1",
        "pact.rc5-owned-world.v1",
        "pact.rc6-owned-world.v1",
        "pact.rc7-owned-world.v1",
        "pact.rc8-owned-world.v1",
        "pact.rc9-owned-world.v1",
        "pact.rc10-owned-world.v1",
        "pact.rc11-owned-world.v1",
      ]) {
        await expect(
          prepareOwnedRC12World({ pactUrl, nonce }, protocol, protocol.cells[1], {
            secrets,
            retention: "preserve",
            checkpoint: { ...checkpoint, schemaVersion },
          }),
        ).rejects.toThrow("OWNED_CHECKPOINT_MISMATCH");
      }
      expect(() => executeOwnedRC2Protocol(protocol, {} as never, {} as never)).toThrow("POST_E3_STUDY_MISMATCH");
    } finally {
      await reopened.disconnect();
    }
  } finally {
    await control.pauseClock();
    await control.disconnect();
    await world.disconnect();
    await f.pool.end();
  }
}, 60000);
