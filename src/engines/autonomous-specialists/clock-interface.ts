import { type Data, object } from "../../domain.js";
import type { DomainTime } from "../../platform/contracts.js";
import { compareDomainTime } from "../../platform/engine-context.js";
/** Advertise only syntax for real clocks. Native admission still requires a future time. */
export function specialistWakeClockSchema(environmentTime?: DomainTime): Data {
  if (
    environmentTime &&
    (typeof environmentTime.clockId !== "string" ||
      typeof environmentTime.value !== "string" ||
      !environmentTime.clockId.length ||
      environmentTime.clockId.length > 100 ||
      compareDomainTime(environmentTime, environmentTime) !== 0)
  )
    throw Error("PARTICIPANT_CLOCK_REQUIRED");
  const choices: Data[] = [
    {
      properties: {
        clockId: { const: "utc" },
        value: { pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$", format: "date-time" },
      },
    },
  ];
  if (environmentTime && environmentTime.clockId !== "utc")
    choices.push({ properties: { clockId: { const: environmentTime.clockId }, value: { pattern: "^-?\\d{1,40}$" } } });
  return {
    anyOf: choices.map((choice) => ({
      type: "object",
      properties: {
        clockId: object(object(choice.properties).clockId),
        value: { type: "string", ...object(object(choice.properties).value) },
      },
      required: ["clockId", "value"],
      additionalProperties: false,
    })),
  };
}
