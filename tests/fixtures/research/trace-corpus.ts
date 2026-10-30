import { decodeEnvelope, encodeEnvelope, type RunScope } from "../../../src/research/contracts.js";
/** In-process stand-in for a language-neutral worker; no provider or worker process. */
export function fakeBrokerScope(scope: RunScope): RunScope {
  return decodeEnvelope(encodeEnvelope({ protocolVersion: 1, counter: "9007199254740993", scope })).scope!;
}
