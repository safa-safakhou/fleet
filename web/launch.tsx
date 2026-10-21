import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ArchitectureManifest } from "../src/platform/architecture.js";
import type { LaunchCheck } from "../src/platform/launch-contracts.js";
import { ArchitectureFields, fieldProblem } from "./architecture-fields.js";

type Obj = Record<string, unknown>;
export type LaunchApi = <T>(path: string, body?: unknown, method?: "POST" | "PUT") => Promise<T>;
export const exactKey = (ref: { id: string; version: string }) => JSON.stringify([ref.id, ref.version]);
export class LaunchController {
  spec: Obj = {};
  draft: { draftId: string; digest: string } | null = null;
  readiness: LaunchCheck | null = null;
  private revision = 0;
  private saveRequest = crypto.randomUUID();
  private startRequest = crypto.randomUUID();
  constructor(private api: LaunchApi) {}
  edit(spec: Obj) {
    this.spec = structuredClone(spec);
    this.revision++;
    this.readiness = null;
    this.saveRequest = crypto.randomUUID();
  }
  async resume(id: string) {
    const row = await this.api<{ id: string; digest: string; spec: Obj; state: string }>(
      `/launch/drafts/${encodeURIComponent(id)}`,
    );
    if (row.state && row.state !== "draft") throw Error("LAUNCH_ALREADY_STARTED");
    this.edit(row.spec);
    this.draft = { draftId: row.id, digest: row.digest };
    this.startRequest = crypto.randomUUID();
  }
  async check() {
    const revision = this.revision,
      check = await this.api<LaunchCheck>("/launch/check", this.spec);
    if (revision !== this.revision) throw Error("CHECK_SUPERSEDED");
    this.readiness = check;
    return check;
  }
  async save() {
    const revision = this.revision,
      old = this.draft;
    const result = old
      ? {
          draftId: old.draftId,
          ...(await this.api<{ digest: string }>(
            `/launch/drafts/${old.draftId}`,
            { expectedDigest: old.digest, spec: this.spec },
            "PUT",
          )),
        }
      : await this.api<{ draftId: string; digest: string }>("/launch/drafts", {
          requestId: this.saveRequest,
          spec: this.spec,
        });
    this.draft = result;
    if (revision !== this.revision) this.readiness = null;
    return result;
  }
  async start() {
    if (!this.readiness) throw Error("CHECK_REQUIRED");
    if (!this.readiness.ready) throw Error("LAUNCH_NOT_READY");
    if (!this.draft || this.draft.digest !== this.readiness.digest) throw Error("SAVE_CHECKED_DRAFT_REQUIRED");
    return this.api<{ cohortId: string; digest: string; state: string }>("/launch/start", {
      requestId: this.startRequest,
      draftId: this.draft.draftId,
      expectedDigest: this.draft.digest,
    });
  }
}

type Catalog = { architectures: ArchitectureManifest[]; environment: Obj };
type Roster = {
  cohorts: { id: string; name: string; model: unknown; budget: unknown }[];
  agents: { id: string; cohort_id: string; credential_state: string }[];
};
export function LaunchWizard({
  api,
  onCreated,
  onStarted,
  renderConfigure,
}: {
  api: LaunchApi;
  onCreated(id: string): void;
  onStarted(id: string): void;
  renderConfigure?: (save: (configuration: Obj) => void, busy: boolean) => ReactNode;
}) {
  const controller = useRef<LaunchController | null>(null);
  if (!controller.current) controller.current = new LaunchController(api);
  const c = controller.current;
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [roster, setRoster] = useState<Roster>({ cohorts: [], agents: [] }),
    [chosen, setChosen] = useState(""),
    [resume, setResume] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [, refresh] = useState(0);
  useEffect(() => {
    void Promise.all([api<Catalog>("/architectures"), api<Roster>("/state")])
      .then(([a, b]) => {
        setCatalog(a);
        setRoster(b);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "REQUEST_FAILED"));
  }, [api]);
  const work = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
      refresh((n) => n + 1);
    }
  };
  const edit = (patch: Obj) => {
    c.edit({ ...c.spec, ...patch });
    refresh((n) => n + 1);
  };
  const selected = catalog?.architectures.find(
    (m) =>
      exactKey(m.ref) === exactKey((c.spec.architecture ?? { id: "", version: "" }) as { id: string; version: string }),
  );
  return (
    <article className="panel">
      <h2>Launch an architecture</h2>
      <p>
        Select a version, configure it, choose connected accounts and review readiness. Saving a draft keeps execution
        inactive.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label>
        Saved draft ID
        <input value={resume} onChange={(e) => setResume(e.target.value)} />
      </label>
      <button type="button" disabled={busy || !resume} onClick={() => void work(() => c.resume(resume))}>
        Resume draft
      </button>
      <fieldset disabled={busy}>
        <label>
          Architecture and version
          <select
            value={selected ? exactKey(selected.ref) : ""}
            onChange={(e) => {
              const m = catalog?.architectures.find((x) => exactKey(x.ref) === e.target.value);
              if (m)
                edit({
                  architecture: m.ref,
                  architectureConfig: m.defaults,
                  preset: undefined,
                  wakePolicy: undefined,
                  environment: catalog?.environment,
                });
            }}
          >
            <option value="">Choose an architecture</option>
            {catalog?.architectures.map((m) => (
              <option key={exactKey(m.ref)} value={exactKey(m.ref)}>
                {m.name} · {m.ref.id}@{m.ref.version}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p>{selected.description}</p>
            <label>
              Preset
              <select
                value={String(c.spec.preset ?? "")}
                onChange={(e) => {
                  const p = selected.presets.find((p) => p.id === e.target.value);
                  edit({ preset: p?.id, architectureConfig: p?.config ?? selected.defaults });
                }}
              >
                <option value="">Default configuration</option>
                {selected.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ArchitectureFields
              schema={selected.configSchema}
              value={c.spec.architectureConfig}
              onChange={(v) => edit({ architectureConfig: v })}
            />
            <label>
              Connected fleet
              <select
                value={chosen}
                onChange={(e) => {
                  setChosen(e.target.value);
                  const fleet = roster.cohorts.find((x) => x.id === e.target.value);
                  edit({
                    accounts: {
                      agentIds: roster.agents.filter((a) => a.cohort_id === e.target.value).map((a) => a.id),
                    },
                    ...(fleet?.model ? { model: fleet.model } : {}),
                    ...(fleet?.budget ? { budget: fleet.budget } : {}),
                  });
                }}
              >
                <option value="">Choose existing accounts</option>
                {roster.cohorts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {roster.agents.filter((a) => a.cohort_id === chosen && a.credential_state === "ready").length} connected
              accounts. Use Fleet account settings to connect or provision accounts.
            </p>
            {renderConfigure?.((configuration) => edit(configuration), busy)}
            {selected.triggers.includes("event") && (
              <label>
                <input
                  type="checkbox"
                  checked={(c.spec.wakePolicy as Obj | undefined)?.enabled === true}
                  onChange={(e) =>
                    edit({
                      wakePolicy: {
                        enabled: e.target.checked,
                        categories: ["offer", "contract", "conversation", "completion", "resource", "raid"],
                        quietCategories: [],
                        periodicReviewMinutes: 15,
                      },
                    })
                  }
                />
                Enable event wakes
              </label>
            )}
            <button
              type="button"
              disabled={!!fieldProblem(selected.configSchema)}
              onClick={() =>
                void work(async () => {
                  const d = await c.save();
                  onCreated(d.draftId);
                })
              }
            >
              Save inactive draft
            </button>
            <button type="button" onClick={() => void work(() => c.check())}>
              Check readiness
            </button>
          </>
        )}
      </fieldset>
      {c.draft && (
        <p>
          Saved draft {c.draft.draftId} · {c.draft.digest}
        </p>
      )}
      {c.readiness && (
        <>
          <ul>
            {c.readiness.checks.map((r) => (
              <li key={`${r.area}:${r.code}`}>
                {r.status}: {r.code} — {r.detail}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="primary"
            disabled={busy || !c.readiness.ready || c.draft?.digest !== c.readiness.digest}
            onClick={() =>
              void work(async () => {
                const result = await c.start();
                onStarted(result.cohortId);
              })
            }
          >
            Start fleet
          </button>
        </>
      )}
    </article>
  );
}
