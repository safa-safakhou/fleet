import { type Data, object } from "./domain.js";
import { unpackEvidenceMetadata } from "./evidence-metadata.js";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
// A whole-row presentation: common values are explicit for every row. Only
// use it when it is smaller; no fact, null, version, unit or provenance is lost.
export function factTable(value: unknown, options: { atomicPaths?: readonly string[] } = {}): unknown {
  const list = Array.isArray(value);
  const entries = list ? value.map((row, i) => [String(i), row] as const) : Object.entries(object(value));
  if (entries.length < 2 || entries.some(([, row]) => !row || typeof row !== "object" || Array.isArray(row)))
    return value;
  const records = entries.map(([, row]) => object(row));
  const fields = (v: Data) =>
    Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
  const sameFields = (nodes: Data[]) =>
    nodes.every((node) => JSON.stringify(fields(node)) === JSON.stringify(fields(nodes[0])));
  const columns: string[] = [];
  let unsupported = false;
  const descend = (nodes: Data[], prefix: string) => {
    for (const key of [...new Set(nodes.flatMap(fields))].sort()) {
      if (["__proto__", "prototype", "constructor"].includes(key) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
        unsupported = true;
      const path = prefix ? `${prefix}.${key}` : key;
      const values = nodes.map((node) => node[key]);
      if (
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) &&
        !options.atomicPaths?.includes(path) &&
        values.every((v) => v && typeof v === "object" && !Array.isArray(v)) &&
        fields(object(values[0])).length &&
        sameFields(values.map(object))
      )
        descend(values.map(object), path);
      else columns.push(path);
    }
  };
  descend(records, "");
  if (unsupported) return value;
  if (
    columns.some((path) =>
      path
        .split(".")
        .some(
          (key) => ["__proto__", "prototype", "constructor"].includes(key) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key),
        ),
    )
  )
    return value;
  const cell = (row: Data, path: string) => path.split(".").reduce<unknown>((v, key) => object(v)[key], row);
  const derivedKey = records.every(
    (row) =>
      typeof row.turnId === "string" &&
      Number.isInteger(row.decision) &&
      typeof row.category === "string" &&
      row.key === `${row.turnId}:${row.decision}:${row.category}`,
  );
  const common: Data = {},
    varying = columns.filter((path) => {
      if (derivedKey && path === "key") return false;
      const values = records.map((row) => cell(row, path));
      const literal = values[0] === undefined ? undefined : JSON.stringify(values[0]);
      if (
        literal !== undefined &&
        values.every((v) => v !== undefined && JSON.stringify(v) === literal) &&
        bytes(path) + 1 + Buffer.byteLength(literal) < records.length * (Buffer.byteLength(literal) + 1)
      ) {
        common[path] = values[0];
        return false;
      }
      return true;
    });
  const absent: Record<number, number[]> = {};
  const encoded = {
    ...(derivedKey ? { keyFormat: "{turnId}:{decision}:{category}" } : {}),
    factTable: list ? "list" : "map",
    columns: list ? varying : ["$key", ...varying],
    common,
    rows: records.map((row, i) => {
      const values = varying.map((path, index) => {
        const value = cell(row, path);
        if (value === undefined) {
          absent[i] ??= [];
          absent[i].push(index + (list ? 0 : 1));
          return null;
        }
        return value;
      });
      return [...(list ? [] : [entries[i][0]]), ...values];
    }),
    ...(Object.keys(absent).length ? { absent } : {}),
  };
  return bytes(encoded) < bytes(value) ? encoded : value;
}

// Also used by consumers that need the ordinary shape, and by round-trip gates.
export function expandFactTables(value: unknown, scope: unknown = value): unknown {
  if (Array.isArray(value)) return value.map((cell) => expandFactTables(cell, scope));
  if (!value || typeof value !== "object") return value;
  const table = unpackEvidenceMetadata(object(value));
  if (
    table.sameFact === "authority.allowedActions" &&
    Object.keys(table).length === 1 &&
    Array.isArray(object(object(scope).authority).allowedActions)
  )
    return structuredClone(object(object(scope).authority).allowedActions);

  if (["ambition", "buildings"].includes(String(table.sameFact)) && Object.keys(table).length === 1) {
    const source = object(scope)[String(table.sameFact)];
    if (
      (table.sameFact === "ambition" && typeof source === "string") ||
      (table.sameFact === "buildings" && (Array.isArray(source) || object(source).factTable === "list"))
    )
      return expandFactTables(structuredClone(source), scope);
  }

  if (["map", "list"].includes(String(table.factTable)) && Array.isArray(table.columns) && Array.isArray(table.rows)) {
    const columns = table.columns as string[];
    const decoded = table.rows.map((raw, rowIndex) => {
      const cells = raw as unknown[],
        row: Data = {};
      for (const [path, cell] of [
        ...Object.entries(object(table.common)),
        ...columns.map((path, i) => [path, cells[i]] as const),
      ]) {
        if (
          path === "$key" ||
          (Array.isArray(object(table.absent)[String(rowIndex)]) &&
            (object(table.absent)[String(rowIndex)] as unknown[]).includes(columns.indexOf(path)))
        )
          continue;
        const keys = path.split(".");
        let target = row;
        for (const key of keys.slice(0, -1)) {
          target[key] ??= {};
          target = object(target[key]);
        }
        target[keys.at(-1) as string] = expandFactTables(cell, scope);
      }
      if (table.keyFormat === "{turnId}:{decision}:{category}")
        row.key = `${row.turnId}:${row.decision}:${row.category}`;
      return row;
    });
    return table.factTable === "list"
      ? decoded
      : Object.fromEntries(table.rows.map((raw, i) => [(raw as unknown[])[0], decoded[i]]));
  }
  return Object.fromEntries(Object.entries(table).map(([key, cell]) => [key, expandFactTables(cell, scope)]));
}
