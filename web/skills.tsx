import type { Data } from "../src/domain.js";
export function SkillsView({ data }: { data: Data }) {
  const skills = Array.isArray(data.skills) ? (data.skills as Data[]) : [];
  return (
    <section>
      <h3>Skills</h3>
      <p>{String(data.meaning ?? "Private details withheld or unavailable.")}</p>
      {skills.map((s, i) => (
        <details key={String((s.ref as Data)?.id ?? i)}>
          <summary>
            {String((s.summary as Data)?.purpose ?? "Private skill unavailable")} · {String(s.status)}
          </summary>
          <p>
            Author {String(s.author)} · adopted by {JSON.stringify(s.adoptedBy)}
          </p>
          <pre>{JSON.stringify({ ref: s.ref, sourceIds: s.sourceIds, evaluations: s.evaluations }, null, 2)}</pre>
        </details>
      ))}
      {skills.length === 0 && <p>No retained skill records delivered.</p>}
    </section>
  );
}
