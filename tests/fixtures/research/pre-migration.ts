import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "../../../src/db.js";
import { digest } from "../../../src/research/contracts.js";
import { Vault } from "../../../src/vault.js";
export const preservationKey = Buffer.alloc(32, 17).toString("base64");
export const preservationTime = new Date("2026-10-31T12:00:00Z");
const ident = (s: string) => `"${s.replaceAll('"', '""')}"`;
export async function legacySchema(pool: Pool) {
  for (const file of (await readdir("migrations"))
    .filter((x) => /^\d{3}_.*\.sql$/.test(x) && Number(x.slice(0, 3)) <= 41)
    .sort())
    await pool.query(await readFile(`migrations/${file}`, "utf8"));
}
export async function seedLegacy(pool: Pool) {
  const cohort = randomUUID(),
    vault = new Vault(preservationKey),
    agents = Array.from({ length: 4 }, () => randomUUID()),
    turns = agents.map(() => randomUUID()),
    bindings = agents.map(() => randomUUID()),
    tasks = agents.map(() => randomUUID()),
    commands = agents.map(() => randomUUID()),
    session = randomUUID();
  await pool.query(
    "INSERT INTO cohorts(id,name,count,interval_minutes,seed,state,model,budget,generation,anchor_at,observation_consent) VALUES($1,'Synthetic preservation',4,15,'20261030','paused',$2,$3,7,$4,true)",
    [
      cohort,
      { route: "ollama", model: "fake" },
      { mode: "finite", callLimit: 10, tokenLimit: 120000, perCallTokenLimit: 40000 },
      preservationTime,
    ],
  );
  await pool.query(
    "INSERT INTO cohort_engine_profiles(cohort_id,profile_id,profile_version,created_at) VALUES($1,'reactive-basic','1',$2)",
    [cohort, preservationTime],
  );
  for (let i = 0; i < 4; i++) {
    await pool.query(
      "INSERT INTO agents(id,cohort_id,ordinal,name,strategy,state,credential_state,next_due_at,fence,secret_cipher,read_memory_cipher) VALUES($1,$2,$3,$4,'{}',$5,'ready',$6,9,$7,$8)",
      [
        agents[i],
        cohort,
        i + 1,
        `Synthetic ${i}`,
        i === 3 ? "stopped" : "ready",
        new Date(preservationTime.getTime() + i * 900000),
        vault.encrypt({ grant: "synthetic-only", budget: 3 }, agents[i]),
        vault.encrypt({ fact: "old synthetic history" }, agents[i]),
      ],
    );
    await pool.query(
      "INSERT INTO turns(id,agent_id,cohort_id,generation,fence,worker,state,due_at,started_at,deadline_at,finished_at,code,pending_command,pending_action,unknown_usage) VALUES($1,$2,$3,7,9,'synthetic',$4,$5,$5,$6,$7,$8,$9,$10,$11)",
      [
        turns[i],
        agents[i],
        cohort,
        i === 1 || i === 2 ? "pending" : "finished",
        preservationTime,
        new Date(preservationTime.getTime() + 60000),
        i === 0 || i === 3 ? preservationTime : null,
        i === 3 ? "STOPPED" : null,
        i === 1 || i === 2 ? commands[i] : null,
        i === 1 || i === 2 ? { kind: "synthetic", original: commands[i] } : null,
        i === 2,
      ],
    );
    await pool.query(
      "INSERT INTO environment_bindings(id,agent_id,environment_id,environment_version,instance_id,account_ref,actor_ref,entity_ref,state,provenance,created_at) VALUES($1,$2,'pact','1','synthetic-world',$3,$4,$5,'active','recorded',$6)",
      [bindings[i], agents[i], `account:${i}`, `actor:${i}`, `kingdom:${i}`, preservationTime],
    );
    await pool.query(
      "INSERT INTO platform_tasks(id,binding_id,cohort_id,profile_id,profile_version,task_key,state,due_at,created_at) VALUES($1,$2,$3,'reactive-basic','1',$4,$5,$6,$6)",
      [
        tasks[i],
        bindings[i],
        cohort,
        `synthetic:${i}`,
        i === 3 ? "completed" : i === 0 ? "ready" : "waiting",
        preservationTime,
      ],
    );
    if (i < 3) {
      await pool.query(
        "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status,input_tokens,output_tokens) VALUES($1,$2,$3,'finite',$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          cohort,
          turns[i],
          i === 0 ? 15 : 40000,
          preservationTime,
          ["reported", "reserved", "unknown"][i],
          i === 0 ? 7 : null,
          i === 0 ? 8 : null,
        ],
      );
      await pool.query(
        "INSERT INTO platform_commands(command_id,turn_id,task_id,binding_id,intent_cipher,state,outcome,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)",
        [
          commands[i],
          turns[i],
          tasks[i],
          bindings[i],
          vault.encrypt({ commandId: commands[i], payload: { to: "synthetic" } }, commands[i]),
          ["confirmed", "pending", "unknown"][i],
          i === 0 ? { receipt: commands[i], code: "APPLIED" } : null,
          preservationTime,
        ],
      );
    }
    await pool.query(
      "INSERT INTO turn_events(id,turn_id,agent_id,cohort_id,occurred_at,stage,label,detail_cipher) VALUES($1,$2,$3,$4,$5,'synthetic','preserved',$6)",
      [
        randomUUID(),
        turns[i],
        agents[i],
        cohort,
        preservationTime,
        vault.encrypt({ source: "synthetic", sequence: i }, turns[i]),
      ],
    );
  }
  await pool.query(
    "INSERT INTO command_resolutions(command_id,turn_id,agent_id,cohort_id,resolved_at,code,source,action_cipher,evidence) VALUES($1,$2,$3,$4,$5,'APPLIED','receipt',$6,$7)",
    [
      commands[0],
      turns[0],
      agents[0],
      cohort,
      preservationTime,
      vault.encrypt({ commandId: commands[0] }, commands[0]),
      { receipt: commands[0], synthetic: true },
    ],
  );
  await pool.query("INSERT INTO operator_sessions(hash,expires_at,csrf) VALUES($1,$2,'synthetic')", [
    session,
    new Date(preservationTime.getTime() + 3600000),
  ]);
  return { cohort, agents, turns, bindings, tasks, commands, session };
}
export type Columns = Record<string, string[]>;
export async function columns(pool: Pool): Promise<Columns> {
  const rows = (
    await pool.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name<>'architecture_fixture_owner' ORDER BY table_name,ordinal_position",
    )
  ).rows;
  const result: Columns = {};
  for (const row of rows) {
    result[row.table_name] ??= [];
    result[row.table_name].push(row.column_name);
  }
  return result;
}
export async function rowHashes(pool: Pool, fields: Columns) {
  const tables: Record<string, { rows: number; digest: string }> = {};
  for (const [table, cols] of Object.entries(fields)) {
    const rows = (
      await pool.query(
        `SELECT jsonb_build_array(${cols.map(ident).join(",")})::text value FROM ${ident(table)} ORDER BY value`,
      )
    ).rows.map((x) => x.value);
    tables[table] = { rows: rows.length, digest: digest(rows) };
  }
  return { digest: digest(tables), tables };
}
