import { useState } from "react";
import type { ResearchAPI } from "./api.js";
import { saveBlob } from "./comparison.js";

type Writer = { write: (data: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };
type Destination = { createWritable: () => Promise<Writer> };
export function ArchiveExport({ runId, snapshotId, api }: { runId: string; snapshotId: string; api: ResearchAPI }) {
  const [key, setKey] = useState(""),
    [saved, setSaved] = useState(false),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const picker = (
    window as unknown as { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<Destination> }
  ).showSaveFilePicker;
  const prepare = async () => {
    try {
      await api.request(`/runs/${encodeURIComponent(runId)}/coverage?snapshotId=${snapshotId}`);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      setKey([...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""));
      setSaved(false);
      setStatus("Archive key prepared. Save it privately before exporting.");
    } catch {
      setKey("");
      setStatus("Archive unavailable.");
    }
  };
  const archive = async () => {
    if (!picker || !key || !saved) return;
    let writer: Writer | undefined;
    setBusy(true);
    try {
      const destination = await picker({ suggestedName: `${snapshotId}.fleet` });
      writer = await destination.createWritable();
      await api.archive(runId, snapshotId, key, (part) => writer!.write(part));
      await writer.close();
      setStatus("Encrypted archive saved; retain the separate private key.");
    } catch {
      await writer?.abort().catch(() => {});
      setStatus("Archive unavailable or cancelled; partial file was not committed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>Complete encrypted evidence archive</h2>
      <p>
        Explicit export streams the complete pinned O5 archive, including all retained event pages and artifacts. Store
        the key and archive in private destinations. Decrypted chart/table exports are separate.
      </p>
      <button type="button" disabled={busy} onClick={() => void prepare()}>
        Prepare encrypted archive key
      </button>
      {key && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              saveBlob(new Blob([key], { type: "text/plain" }), `${snapshotId}.key`);
              setSaved(true);
            }}
          >
            Save private archive key
          </button>
          <button type="button" disabled={busy || !saved || !picker} onClick={() => void archive()}>
            Save complete encrypted archive
          </button>
        </>
      )}
      {!picker && (
        <p>
          This browser has no private streaming file writer. Use a browser that supports local file destinations for the
          complete archive.
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
