export type TraceFilters = { search: string; kind: string; stream: string; zoom: number };
export function ResearchFilters({
  value,
  onChange,
  kinds,
  streams,
}: {
  value: TraceFilters;
  onChange: (v: TraceFilters) => void;
  kinds: string[];
  streams: string[];
}) {
  return (
    <div className="research-filters">
      <label>
        Search loaded events
        <input
          aria-label="Search loaded events"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </label>
      <label>
        Event family
        <select value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value })}>
          <option value="">All families</option>
          {kinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Stream
        <select value={value.stream} onChange={(e) => onChange({ ...value, stream: e.target.value })}>
          <option value="">All streams</option>
          {streams.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Lane zoom
        <input
          type="range"
          min="1"
          max="4"
          value={value.zoom}
          onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
