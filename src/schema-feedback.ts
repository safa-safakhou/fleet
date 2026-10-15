import { type Data, object } from "./domain.js";

const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, stable(v)]),
        )
      : value;
// A schema lookup need not repeat assertions already present in the supplied
// output schema. Reference only a byte-for-byte structural match after restoring
// the original required list; no annotation, constraint or argument is guessed.
export function referenceSchemaFeedback(context: Data, output: Data): Data {
  const read = object(context.requestedRead),
    result = object(read.result),
    original = object(result.schema);
  if (
    !["fleet_action_schema", "fleet_continuation_schema"].includes(String(read.tool)) ||
    !Array.isArray(original.required)
  )
    return context;
  const kind = object(object(original.properties).kind).const;
  if (read.tool === "fleet_action_schema" && typeof kind !== "string") return context;
  const keys = JSON.stringify(Object.keys(object(original.properties)).sort());
  let pointer: string | undefined;
  const visit = (value: unknown, path: string) => {
    if (pointer || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        visit(v, `${path}/${i}`);
      });
      return;
    }
    const node = object(value);
    if (
      (read.tool === "fleet_action_schema"
        ? object(object(node.properties).kind).const === kind
        : JSON.stringify(Object.keys(object(node.properties)).sort()) === keys) &&
      JSON.stringify(stable({ ...node, required: original.required })) === JSON.stringify(stable(original))
    ) {
      pointer = path;
      return;
    }
    for (const [key, v] of Object.entries(node)) visit(v, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
  };
  visit(output, "");
  if (!pointer) return context;
  const reference = { schemaAtOutput: pointer, originalRequired: original.required };
  if (JSON.stringify(reference).length >= JSON.stringify(original).length) return context;
  return { ...context, requestedRead: { ...read, result: { ...result, schema: reference } } };
}
export function expandSchemaFeedback(context: Data, output: Data): Data {
  const read = object(context.requestedRead),
    result = object(read.result),
    reference = object(result.schema);
  if (typeof reference.schemaAtOutput !== "string" || !Array.isArray(reference.originalRequired)) return context;
  const shape = reference.schemaAtOutput
    .split("/")
    .slice(1)
    .reduce<unknown>(
      (v, k) => (Array.isArray(v) ? v[Number(k)] : object(v)[k.replaceAll("~1", "/").replaceAll("~0", "~")]),
      output,
    );
  return {
    ...context,
    requestedRead: {
      ...read,
      result: { ...result, schema: { ...object(shape), required: reference.originalRequired } },
    },
  };
}

const literalIndexes = new WeakMap<object, Map<string, string>>();
function analysisLiteral(output: Data, type: string, field: string): string | undefined {
  let index = literalIndexes.get(output);
  if (!index) {
    index = new Map<string, string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      const node = object(value),
        props = object(node.properties),
        kind = object(props.type).const;
      if (typeof kind === "string")
        for (const [key, shape] of Object.entries(props)) {
          const literal = object(shape).const;
          if (typeof literal === "string") index?.set(`${kind}.${key}`, literal);
        }
      for (const child of Object.values(node)) visit(child);
    };
    visit(output);
    literalIndexes.set(output, index);
  }
  return index.get(`${type}.${field}`);
}
// Derived opportunity text may reference the same delivered source text or a
// matching literal in the supplied analysis schema. The evidence itself, its
// ID/direction/author and the opportunity's source ID are never rewritten.
export function referenceOpportunityText(context: Data, output: Data): Data {
  const cognition = object(context.cognition);
  if (!Array.isArray(cognition.analysisOpportunities) || !Array.isArray(cognition.evidence)) return context;
  const evidence = cognition.evidence.map(object);
  const opportunities = cognition.analysisOpportunities.map((raw) => {
    const opportunity = object(raw),
      index = evidence.findIndex((e) => e.id === opportunity.sourceId),
      source = index < 0 ? undefined : evidence[index];
    return Object.fromEntries(
      Object.entries(opportunity).map(([field, value]) => {
        if (typeof value !== "string" || value.length < 64) return [field, value];
        let selected: unknown = value;
        const consider = (candidate: Data) => {
          if (JSON.stringify(candidate).length < JSON.stringify(selected).length) selected = candidate;
        };
        if (source) {
          const strings = (v: unknown, path: string) => {
            if (typeof v === "string") {
              if (v.startsWith(value))
                consider({ sameTextAs: path, ...(v.length === value.length ? {} : { prefixLength: value.length }) });
              return;
            }
            if (!v || typeof v !== "object" || Array.isArray(v)) return;
            for (const [k, child] of Object.entries(object(v)))
              if (
                /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) &&
                !["__proto__", "prototype", "constructor", "coverage"].includes(k)
              )
                strings(child, `${path}.${k}`);
          };
          strings(object(source.detail).body, `evidence[${index}].detail.body`);
        }
        for (const name of ["evidenceQuote", "observedFact"]) {
          const literal = analysisLiteral(output, String(opportunity.type), name);
          if (literal && literal.length >= 64 && value.startsWith(literal))
            consider({
              sameTextAs: `schema.${String(opportunity.type)}.${name}.const`,
              ...(value.length === literal.length ? {} : { suffix: value.slice(literal.length) }),
            });
        }
        return [field, selected];
      }),
    );
  });
  return { ...context, cognition: { ...cognition, analysisOpportunities: opportunities } };
}
export function expandOpportunityText(context: Data, output: Data): Data {
  const cognition = object(context.cognition);
  if (!Array.isArray(cognition.analysisOpportunities) || !Array.isArray(cognition.evidence)) return context;
  const opportunities = cognition.analysisOpportunities.map((raw) =>
    Object.fromEntries(
      Object.entries(object(raw)).map(([field, value]) => {
        const ref = object(value);
        if (typeof ref.sameTextAs !== "string") return [field, value];
        let text: unknown;
        const match = ref.sameTextAs.match(/^evidence\[(\d+)\]\.(.*)$/);
        if (match) {
          const episode = object((cognition.evidence as unknown[])[Number(match[1])]);
          if (episode.id !== object(raw).sourceId) return [field, value];
          text = match[2].split(".").reduce<unknown>((v, k) => object(v)[k], episode);
        } else {
          const parts = ref.sameTextAs.split(".");
          if (parts.length === 4 && parts[0] === "schema" && parts[3] === "const")
            text = analysisLiteral(output, parts[1], parts[2]);
        }
        if (typeof text !== "string") return [field, value];
        if (typeof ref.prefixLength === "number") text = text.slice(0, ref.prefixLength);
        if (typeof ref.suffix === "string") text += ref.suffix;
        return [field, text];
      }),
    ),
  );
  return { ...context, cognition: { ...cognition, analysisOpportunities: opportunities } };
}
