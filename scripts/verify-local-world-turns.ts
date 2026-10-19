import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeCode } from "../src/domain.js";
import { runtime } from "../src/runtime.js";
import { turnVerificationFailure } from "./local-turn-verification.js";

// Explicit local operator command: no scheduler, retries, new accounts or history reset.
const [root, id, selection] = process.argv.slice(2);
const profiles = selection?.split(",");
if (
  profiles &&
  (new Set(profiles).size !== profiles.length ||
    profiles.some((p) => !["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"].includes(p)))
)
  throw Error("Invalid explicit profile selection");
if (!root || !id || !/^[a-z0-9-]{1,60}$/.test(id)) throw Error("Private root and unique pass ID required");
const config = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
assert.equal(config.root, resolve(root));
assert.match(config.id, /^local-four-\d{8}-[a-f0-9]{8}$/);
const historicalFile = resolve(root, "window.json"),
  historical = readFileSync(historicalFile, "utf8");
assert.equal(JSON.parse(historical).status, "closed");
const gateFile = resolve(root, `single-pass-${id}.json`);
writeFileSync(gateFile, JSON.stringify({ status: "prepared", mode: "single-pass", id }), { mode: 0o600, flag: "wx" });
Object.assign(process.env, config.fleetEnv, { FLEET_RUN_WINDOW_FILE: gateFile });
const r = runtime();
const groups = (
  await r.pool.query(
    "SELECT c.id,c.name,c.state,c.budget,p.profile_id FROM cohorts c JOIN cohort_engine_profiles p ON p.cohort_id=c.id ORDER BY c.name",
  )
).rows;
const result: { id: string; attempts: unknown[]; startedAt?: string; endedAt?: string; parked?: boolean } = {
  id,
  attempts: [],
};
const save = () =>
  writeFileSync(resolve(root, "evidence", `single-pass-${id}.json`), JSON.stringify(result, null, 2), { mode: 0o600 });
const control = (action: string) =>
  execFileSync(config.node, ["workers/rules/dist/control.js", action], {
    cwd: config.pactRepo,
    env: { ...process.env, ...config.pactEnv },
    stdio: "pipe",
  });
try {
  assert.deepEqual(
    groups.map((g) => g.profile_id),
    ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"],
  );
  assert.ok(groups.every((g) => g.state === "paused"));
  const dirty = (
    await r.pool.query(
      "SELECT (SELECT count(*)::int FROM turns WHERE state IN('running','pending','needs_owner') OR pending_command IS NOT NULL)+(SELECT count(*)::int FROM compute_ledger WHERE status IN('unknown','reserved')) n",
    )
  ).rows[0].n;
  assert.equal(dirty, 0, "Reconcile existing uncertainty before a pass");
  const selected = [];
  for (const group of groups.filter((g) => !profiles || profiles.includes(g.profile_id))) {
    if (group.budget.inputByteLimit < 48000)
      await r.store.increaseInputAllowance(
        group.id,
        48000,
        "Founder authorized operability repair and one-pass verification: deliver whole current facts plus continuity and schema within the existing 32K model context. No lifetime quota, deadline, identity or accounting reset.",
      );
    const agent = (
      await r.pool.query(
        "SELECT id FROM agents WHERE cohort_id=$1 AND ordinal=0 AND state='ready' AND credential_state='ready'",
        [group.id],
      )
    ).rows[0];
    assert.ok(agent, "Original first actor must be ready");
    const binding = await r.bindings.forAgent(agent.id);
    assert.ok(binding);
    const task = await r.tasks.upsertFromEvent(
      binding,
      {
        id: `single-pass:${id}`,
        type: "operator_review",
        sourceRef: `single-pass:${id}`,
        observedAt: new Date().toISOString(),
        environmentTime: { clockId: "utc", value: new Date().toISOString() },
        metadata: {},
      },
      `single-pass:${id}`,
    );
    selected.push({ group, agent, binding, task });
  }
  await r.store.setStates(
    groups.map((g) => g.id),
    "running",
    true,
  );
  control("resume");
  const startsAt = Date.now();
  // Existing wall-clock emergency fence; only this process reads the new file.
  // The execution bound is the four exact task IDs below, each claimed once.
  writeFileSync(
    gateFile,
    JSON.stringify({
      status: "running",
      mode: "single-pass",
      id,
      startsAt,
      endsAt: startsAt + 3600000,
      taskIds: selected.map((s) => s.task.id),
    }),
    { mode: 0o600 },
  );
  result.startedAt = new Date(startsAt).toISOString();
  save();
  for (const { group, agent, task } of selected) {
    const claim = await r.tasks.claim(`single-pass:${id}`, r.store.now(), task.id);
    assert.equal(claim?.taskId, task.id);
    if (!claim) throw Error("EXACT_TASK_NOT_ADMITTED");
    let error: string | undefined;
    try {
      await r.host.run(claim);
    } catch (e) {
      error = safeCode(e);
    }
    const turn = (
      await r.pool.query("SELECT id,state,code,calls,actions,pending_command FROM turns WHERE id=$1", [claim.turn.id])
    ).rows[0];
    const compute = (
      await r.pool.query(
        "SELECT status,input_tokens,output_tokens FROM compute_ledger WHERE turn_id=$1 ORDER BY created_at",
        [claim.turn.id],
      )
    ).rows;
    // Legacy controllers persist failures instead of throwing; inspect the
    // terminal receipt, not only the host promise, before calling a pass healthy.
    const resolutions = (
      await r.pool.query("SELECT command_id,code FROM command_resolutions WHERE turn_id=$1 ORDER BY resolved_at", [
        claim.turn.id,
      ])
    ).rows;
    if (!error) error = turnVerificationFailure(turn, compute, resolutions);
    if (error) process.exitCode = 1;
    result.attempts.push({
      profile: group.profile_id,
      agentId: agent.id,
      taskId: task.id,
      turn,
      compute,
      resolutions,
      ...(error ? { error } : {}),
    });
    save();
    console.log(
      JSON.stringify({ profile: group.profile_id, turnId: claim.turn.id, code: turn.code, error: error ?? null }),
    );
  }
} finally {
  writeFileSync(gateFile, JSON.stringify({ status: "closed", mode: "single-pass", id, closedAt: Date.now() }), {
    mode: 0o600,
  });
  control("pause");
  await r.host.drain();
  await r.store.setStates(
    groups.map((g) => g.id),
    "paused",
    true,
  );
  assert.equal(readFileSync(historicalFile, "utf8"), historical);
  result.endedAt = new Date().toISOString();
  result.parked = true;
  save();
  await r.pool.end();
}
