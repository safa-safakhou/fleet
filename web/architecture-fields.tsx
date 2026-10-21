type Schema = Record<string, unknown>;
const object = (value: unknown): Schema =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Schema) : {};
export function fieldProblem(raw: unknown, path = "", depth = 0): string | null {
  const s = object(raw),
    label = path || "/";
  if (depth > 8) return `${label}: configuration nesting exceeds supported depth`;
  const supported = new Set([
    "type",
    "properties",
    "additionalProperties",
    "required",
    "title",
    "description",
    "default",
    "enum",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "items",
    "$schema",
  ]);
  for (const key of Object.keys(s))
    if (!supported.has(key)) return `${label}: unsupported configuration keyword ${key}`;
  if (s.enum && (!Array.isArray(s.enum) || !s.enum.length || s.enum.some((v) => typeof v !== "string")))
    return `${label}: unsupported enum`;
  if (s.type === "object") {
    const entries = Object.entries(object(s.properties));
    if (entries.length > 100 || (s.additionalProperties !== undefined && s.additionalProperties !== false))
      return `${label}: unsupported open object`;
    for (const [key, child] of entries) {
      const error = fieldProblem(child, `${path}/${key}`, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (s.type === "array") {
    if (!Number.isInteger(s.maxItems) || Number(s.maxItems) > 100 || Number(s.maxItems) < 0)
      return `${label}: array needs a supported bounded maxItems (0–100)`;
    return fieldProblem(s.items, `${path}/*`, depth + 1);
  }
  return ["string", "number", "integer", "boolean"].includes(String(s.type))
    ? null
    : `${label}: unsupported configuration type`;
}
export function ArchitectureFields({
  schema,
  value,
  onChange,
  path = "configuration",
}: {
  schema: unknown;
  value: unknown;
  onChange(value: unknown): void;
  path?: string;
}) {
  const problem = fieldProblem(schema),
    s = object(schema);
  if (problem) return <p role="alert">Configuration unavailable: {problem}</p>;
  if (s.type === "object")
    return (
      <fieldset>
        <legend>{path}</legend>
        {Object.entries(object(s.properties)).map(([key, child]) => (
          <ArchitectureFields
            key={key}
            schema={child}
            path={`${path}.${key}`}
            value={object(value)[key]}
            onChange={(v) => onChange({ ...object(value), [key]: v })}
          />
        ))}
      </fieldset>
    );
  if (s.type === "array") {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend>{path}</legend>
        {items.map((v, i) => (
          <div key={String(i)}>
            <ArchitectureFields
              schema={s.items}
              value={v}
              path={`${path}[${i}]`}
              onChange={(next) => onChange(items.map((old, j) => (j === i ? next : old)))}
            />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              Remove {path}[{i}]
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= Number(s.maxItems)}
          onClick={() =>
            onChange([
              ...items,
              object(s.items).default ??
                (object(s.items).type === "object"
                  ? {}
                  : object(s.items).type === "boolean"
                    ? false
                    : object(s.items).type === "array"
                      ? []
                      : object(s.items).type === "number" || object(s.items).type === "integer"
                        ? 0
                        : ""),
            ])
          }
        >
          Add {path}
        </button>
      </fieldset>
    );
  }
  if (Array.isArray(s.enum))
    return (
      <label>
        {path}
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Select
          </option>
          {s.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      </label>
    );
  if (s.type === "boolean")
    return (
      <label>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {path}
      </label>
    );
  return (
    <label>
      {path}
      <input
        type={s.type === "string" ? "text" : "number"}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        min={s.minimum as number | undefined}
        max={s.maximum as number | undefined}
        minLength={s.minLength as number | undefined}
        maxLength={s.maxLength as number | undefined}
        step={s.type === "integer" ? 1 : "any"}
        onChange={(e) =>
          onChange(s.type === "string" ? e.target.value : e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </label>
  );
}
