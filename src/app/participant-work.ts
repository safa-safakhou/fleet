import { safeCode } from "../domain.js";
import type { Bindings } from "../platform/bindings.js";
import type { EnvironmentEvent } from "../platform/contracts.js";
import type { EnvironmentRegistry } from "../platform/environment-registry.js";
import type { CommandExecutor } from "../platform/execution.js";
import type { TaskStore } from "../platform/tasks.js";
import type { Store } from "../store.js";
import { ParticipantActions } from "./action-services.js";
import { ParticipantMessages } from "./participant-messaging.js";

type Options = {
  store: Store;
  tasks: TaskStore;
  bindings: Bindings;
  environments: EnvironmentRegistry;
  commands: CommandExecutor;
  enabled(): boolean;
};
/** Native bounded bookkeeping only. No model access, replacement command or grant acquisition. */
export class ParticipantWork {
  constructor(private options: Options) {}
  async tick({ admissionOpen, signal }: { admissionOpen: boolean; signal: AbortSignal }) {
    if (!this.options.enabled() || signal.aborted) return 0;
    const { store, tasks, bindings, environments, commands } = this.options;
    const profiles = store.architectures
      .list()
      .filter((m) => m.modules.some((x) => x.id === "participant-state" && x.version === "1"))
      .map((m) => m.ref);
    if (!profiles.length) return 0;
    const rows = (
      await store.pool.query(
        `SELECT b.id,p.profile_id,p.profile_version,p.architecture_config,c.id cohort_id FROM environment_bindings b JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id JOIN cohort_engine_profiles p ON p.cohort_id=c.id JOIN jsonb_to_recordset($1::jsonb) AS selected(id text,version text) ON selected.id=p.profile_id AND selected.version=p.profile_version LEFT JOIN specialist_work_cursors x ON x.binding_id=b.id WHERE b.state='active' AND c.state='running' AND c.observation_consent AND (x.next_due_at IS NULL OR x.next_due_at<=$2) AND (EXISTS(SELECT 1 FROM specialist_outbox o WHERE o.binding_id=b.id AND o.status='pending') OR EXISTS(SELECT 1 FROM specialist_wakes w WHERE w.binding_id=b.id AND w.status IN('waiting','unknown')) OR EXISTS(SELECT 1 FROM specialist_intents i WHERE i.binding_id=b.id AND i.status<>'settled')) ORDER BY x.next_due_at NULLS FIRST,b.id LIMIT 10`,
        [JSON.stringify(profiles), store.now()],
      )
    ).rows;
    let processed = 0;
    for (const row of rows) {
      if (signal.aborted || !this.options.enabled()) break;
      const lock = await store.pool.connect();
      let held = false,
        code = "OK";
      try {
        held = (await lock.query("SELECT pg_try_advisory_lock(hashtextextended($1,19281502)) held", [row.id])).rows[0]
          .held;
        if (!held) continue;
        if ((await store.cohort(row.cohort_id)).state !== "running") continue;
        const binding = await bindings.get(row.id),
          instanceId = `${binding.id}:${row.profile_id}@${row.profile_version}`;
        const definition = store.architectures.resolve({ id: row.profile_id, version: row.profile_version }),
          adapter = environments.resolve(binding.environment),
          preset = adapter.specialistPresets?.find((p) => p.id === row.architecture_config.preset);
        const subscriptions = preset?.roles.map((r) => ({
          participantId: r.charter.id,
          subscriptionVersion: r.subscriptions.version,
          categories: r.subscriptions.categories,
          periodic: r.subscriptions.periodic,
        }));
        const intents = (
          await store.pool.query(
            "SELECT command_id,specialist_id FROM specialist_intents WHERE instance_id=$1 AND binding_id=$2 AND status<>'settled' ORDER BY created_at LIMIT 20",
            [instanceId, binding.id],
          )
        ).rows;
        for (const intent of intents) {
          if (signal.aborted) break;
          const actions = new ParticipantActions({
            store,
            tasks,
            commands,
            binding,
            scope: { instanceId, bindingId: binding.id, specialistId: intent.specialist_id },
            resultRecipients: (event) =>
              subscriptions
                ? (definition.route?.({ instanceId, binding, event }, { ...row.architecture_config, subscriptions }) ??
                  [])
                : [],
          });
          await actions.expirePrepared(intent.command_id);
        }
        if (admissionOpen && !signal.aborted) {
          const messaging = new ParticipantMessages(store, tasks, binding, instanceId);
          await messaging.deliverOutbox(8, signal);
          const hasWake = (
            await store.pool.query(
              "SELECT 1 FROM specialist_wakes WHERE instance_id=$1 AND binding_id=$2 AND status IN('waiting','unknown') LIMIT 1",
              [instanceId, binding.id],
            )
          ).rowCount;
          if (hasWake) {
            const session = await environments.connect(binding, { actionEffects: true });
            try {
              const observation = await session.observe({});
              const recent = (
                await store.pool.query(
                  "SELECT id,recipient,detail_cipher FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 AND received_at>$3 ORDER BY sequence DESC LIMIT 100",
                  [instanceId, binding.id, new Date(store.now().getTime() - 30 * 86400000)],
                )
              ).rows;
              const events = recent
                .filter((r) => r.detail_cipher)
                .map((r) =>
                  store.vault.decrypt<EnvironmentEvent>(
                    r.detail_cipher,
                    `specialist-delivery:${instanceId}:${binding.id}:${r.recipient}:${r.id}`,
                  ),
                );
              await messaging.evaluateWakes(
                {
                  facts: observation.payload,
                  categories: events.map((e) => String(e.metadata.category)),
                  replies: events
                    .map((e) => e.metadata.replyToRequestId)
                    .filter((v): v is string => typeof v === "string"),
                },
                observation.environmentTime,
                signal,
                adapter.wakePredicates,
              );
            } finally {
              await session.close();
            }
          }
        }
        processed++;
      } catch (error) {
        code = safeCode(error);
      } finally {
        if (held) {
          await store.pool.query(
            "INSERT INTO specialist_work_cursors VALUES($1,$2,$3) ON CONFLICT(binding_id) DO UPDATE SET next_due_at=excluded.next_due_at,last_code=excluded.last_code",
            [row.id, new Date(store.now().getTime() + 10000), code],
          );
          await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,19281502))", [row.id]);
        }
        lock.release();
      }
    }
    return processed;
  }
}
