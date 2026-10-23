import { type Data, object } from "../../domain.js";
import { factTable } from "../../fact-table.js";
import type { Observation } from "../../platform/contracts.js";

function rows(value: Data, names: string[]): Data {
  const copy = { ...value };
  for (const name of names) if (Object.hasOwn(copy, name)) copy[name] = factTable(copy[name]);
  return copy;
}
/** Whole native values, only represented differently. Raw observations are never mutated. */
export function outlookTables(observation: Observation): Observation {
  let payload = observation.payload;
  const answer = object(payload.requestedRead);
  if (answer.schemaVersion === "pact.agent-outlook.v1") {
    const encoded = rows(answer, ["resources", "commitments", "outcomes", "dependencies", "knownThreats"]);
    if (answer.feasibility && Object.hasOwn(object(answer.feasibility), "candidates"))
      encoded.feasibility = rows(object(answer.feasibility), ["candidates"]);
    payload = { ...payload, requestedRead: encoded };
  }
  const continuity = observation.continuity;
  return {
    ...observation,
    payload,
    ...(continuity
      ? {
          continuity: {
            ...continuity,
            self: {
              ...continuity.self,
              needs: rows(continuity.self.needs, ["resources", "feasibility", "threats", "assumptions"]),
              dependencies: rows(continuity.self.dependencies, ["observed"]),
            },
          },
        }
      : {}),
  };
}
