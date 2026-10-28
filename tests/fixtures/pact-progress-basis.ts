import { type Data, object } from "../../src/domain.js";
import { prepareVllmGenerationSchema } from "../../src/model-schema.js";

/** Current native HTTP fixtures use the reference actually delivered in the expanded generation schema. */
export function fixtureSchemaBasis(schema: Data, kind: "wait" | "action"): Data {
  const properties = decisionProperties(schema, kind);
  if (kind === "action") {
    const basis = object(object(object(properties.expectedOutcome).properties).basis).const;
    if (typeof object(basis).observationRef !== "string") throw Error("FIXTURE_REFERENCE_REQUIRED");
    return object(basis);
  }
  const basis = object(properties.basis),
    ref = object(object(basis.properties).observationRef).const;
  if (typeof ref !== "string") throw Error("FIXTURE_REFERENCE_REQUIRED");
  return {
    observationRef: ref,
    ...(Array.isArray(basis.required) && basis.required.includes("deferral")
      ? {
          deferral: {
            reason: "deliberate_pacing",
            explanation: "Measure this synthetic input without prescribing a game action.",
            reconsiderWhen: "Next synthetic review.",
          },
        }
      : {}),
  };
}

/** Synthetic providers copy the current reference from the delivered contract, not the old state-map format. */
function decisionProperties(schema: Data, kind: "wait" | "action"): Data {
  const expanded = prepareVllmGenerationSchema(schema);
  const envelopes = [expanded, ...((expanded.anyOf ?? expanded.oneOf ?? []) as Data[])];
  const branches = envelopes.flatMap((envelope) => {
    const decision = object(object(envelope.properties).decision);
    const root = Object.keys(decision).length ? decision : envelope;
    return (root.oneOf ?? root.anyOf ?? []) as Data[];
  });
  return object(branches.find((branch) => object(object(branch.properties).kind).const === kind)?.properties);
}
export function fixtureGoalBasis(schema: Data): Data | undefined {
  const basis = object(object(object(decisionProperties(schema, "action").expectedOutcome).properties).basis).const;
  return typeof object(basis).observationRef === "string" ? object(basis) : undefined;
}
export function fixtureWaitBasis(schema: Data): Data {
  return decisionProperties(schema, "wait").basis ? { basis: fixtureSchemaBasis(schema, "wait") } : {};
}
