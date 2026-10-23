import { type Data, object } from "./domain.js";
/** Lossless metadata presentation; source bodies and their literal IDs stay whole. */
export function packEvidenceMetadata(value: Data): Data {
  if (Object.hasOwn(value, "evidenceMetadata")) return value;
  const names = ["candidateIds", "selectedIds", "deliveredIds"] as const;
  if (
    !names.every((n) => Array.isArray(value[n]) && (value[n] as unknown[]).every((x) => typeof x === "string")) ||
    !Array.isArray(value.omitted)
  )
    return value;
  const omissions = value.omitted as Data[];
  if (
    !omissions.every(
      (x) => x && typeof x.id === "string" && typeof x.reason === "string" && Object.keys(x).length === 2,
    )
  )
    return value;
  const ids: string[] = [],
    positions = new Map<string, number>();
  const index = (id: string) => {
    let i = positions.get(id);
    if (i === undefined) {
      i = ids.length;
      ids.push(id);
      positions.set(id, i);
    }
    return i;
  };
  const { candidateIds, selectedIds, deliveredIds, omitted, ...rest } = value;
  const metadata = {
    format: "fleet.evidence-ids.v1",
    meaning: "Indexes address ids. omitted rows=[id index,reason]. No source body is shortened.",
    ids,
    candidate: (candidateIds as string[]).map(index),
    selected: (selectedIds as string[]).map(index),
    delivered: (deliveredIds as string[]).map(index),
    omitted: omissions.map((x) => [index(x.id as string), x.reason]),
  };
  const encoded = { ...rest, evidenceMetadata: metadata };
  return Buffer.byteLength(JSON.stringify(encoded)) < Buffer.byteLength(JSON.stringify(value)) ? encoded : value;
}
export function unpackEvidenceMetadata(value: Data): Data {
  if (["candidateIds", "selectedIds", "deliveredIds", "omitted"].some((key) => Object.hasOwn(value, key))) return value;
  const m = object(value.evidenceMetadata);
  if (
    Object.keys(m).some(
      (key) => !["format", "meaning", "ids", "candidate", "selected", "delivered", "omitted"].includes(key),
    )
  )
    return value;
  if (m.format !== "fleet.evidence-ids.v1" || !Array.isArray(m.ids) || !m.ids.every((x) => typeof x === "string"))
    return value;
  const ids = m.ids as string[],
    valid = (x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) < ids.length;
  if (
    ![m.candidate, m.selected, m.delivered].every((x) => Array.isArray(x) && x.every(valid)) ||
    !Array.isArray(m.omitted) ||
    !m.omitted.every((x) => Array.isArray(x) && x.length === 2 && valid(x[0]) && typeof x[1] === "string")
  )
    return value;
  const { evidenceMetadata: _, ...rest } = value;
  return {
    ...rest,
    candidateIds: (m.candidate as number[]).map((i) => ids[i]),
    selectedIds: (m.selected as number[]).map((i) => ids[i]),
    deliveredIds: (m.delivered as number[]).map((i) => ids[i]),
    omitted: (m.omitted as [number, string][]).map(([i, reason]) => ({ id: ids[i], reason })),
  };
}
