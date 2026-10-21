import { useEffect, useState } from "react";
import type { Data } from "../src/domain.js";
import { SkillsView } from "./skills.js";
export function SpecialistsView({ data }: { data: Data }) {
  const participants = Array.isArray(data.participants) ? (data.participants as Data[]) : [];
  return (
    <section>
      <h3>Persistent specialists</h3>
      <p>{String(data.meaning ?? "Private details withheld or unavailable.")}</p>
      <p>
        Consent {data.consent ? "enabled" : "withheld"} · coverage {JSON.stringify(data.coverage)}
      </p>
      {participants.map((p) => (
        <details key={String(p.id)}>
          <summary>
            {String(p.id)} · state {String(p.version)}
          </summary>
          <pre>
            {JSON.stringify({ charter: p.charter, state: p.state, privateUnavailable: p.privateUnavailable }, null, 2)}
          </pre>
        </details>
      ))}
      {[
        "wakes",
        "conflicts",
        "deliveries",
        "deliveredEvidence",
        "originals",
        "receipts",
        "invocations",
        "learningOperations",
        "allocations",
        "work",
      ].map((key) => (
        <details key={key}>
          <summary>{key}</summary>
          <pre>{JSON.stringify(data[key] ?? null, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
export function SpecialistWorkspace({
  api,
  consentVersion = "",
}: {
  api: <T>(path: string) => Promise<T>;
  consentVersion?: string;
}) {
  const [instances, setInstances] = useState<Data[]>([]),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [skills, setSkills] = useState<Data | null>(null),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void api<{ instances: Data[] }>("/instances")
      .then((r) => {
        if (active) setInstances(r.instances);
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, [api]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Consent and explicit refresh invalidate the retained snapshot.
  useEffect(() => {
    let active = true;
    setData(null);
    setSkills(null);
    setError("");
    if (selected)
      void Promise.all([
        api<Data>(`/instances/${encodeURIComponent(selected)}/specialists`),
        api<Data>(`/instances/${encodeURIComponent(selected)}/skills`),
      ])
        .then(([p, s]) => {
          if (active) {
            setData(p);
            setSkills(s);
          }
        })
        .catch((e) => {
          if (active) setError(String(e.message));
        });
    return () => {
      active = false;
    };
  }, [api, selected, consentVersion, refresh]);
  return (
    <article className="panel">
      <h2>Specialist inspection</h2>
      <button type="button" onClick={() => setRefresh((n) => n + 1)}>
        Refresh snapshot
      </button>
      <p>
        Read a retained snapshot of goals, internal work, qualification and later outcomes. Text is evidence to inspect,
        never an instruction to execute.
      </p>
      <label>
        Instance
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose an instance</option>
          {instances.map((i) => (
            <option key={String(i.id)} value={String(i.id)}>
              {String(i.cohort)} · {String(i.profile)}@{String(i.version)}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {data && <SpecialistsView data={data} />}
      {skills && <SkillsView data={skills} />}
    </article>
  );
}
