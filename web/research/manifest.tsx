import { object } from "./context.js";
export function ManifestInspector({ manifestDigest, manifest }: { manifestDigest: string; manifest: unknown }) {
  const m = object(manifest);
  return (
    <section>
      <h2>Resolved manifest</h2>
      <p>Digest {manifestDigest}</p>
      <p>
        Status {String(m.status ?? "unavailable")} · capability digest {String(m.capabilityDigest ?? "unavailable")} ·
        qualification scope {JSON.stringify(m.qualification ?? "Experimental / not behaviorally qualified")}
      </p>
      <p>
        Draft differences: {JSON.stringify(m.draftDifferences ?? "No recorded draft input; differences unavailable")}.
        Editing uses the existing profile draft workflow.
      </p>
      <pre>{JSON.stringify(manifest, null, 2)}</pre>
    </section>
  );
}
