import { type Data, object } from "../../domain.js";
import { expandFactTables } from "../../fact-table.js";

const rule =
  "Supply needs actual external delivery/GAME window; stocks/allowances, local production, quotes/signatures are not proof.";
/** Current own canonical facts only; no goal evaluation, arithmetic or peer interpretation. */
export function pactNamedObservationSemantics(facts: Data, options: { social?: boolean } = {}): string {
  const decoded = object(expandFactTables(facts)),
    world = object(decoded.environment ?? decoded.world),
    balances = object(world.balances);
  const quantity = (value: unknown) =>
    typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? value : "unknown";
  const rows = Object.keys(balances)
    .sort()
    .map((resource) => {
      const rates = object(object(object(balances[resource]).facts).rates);
      return `${resource}:gross=${quantity(object(rates.gross).perHourWhole)},upkeep=${quantity(object(rates.upkeep).perHourWhole)},net=${quantity(object(rates.net).perHourWhole)}`;
    });
  const social = options.social
    ? " Contacts rows are accepted relationships, not discovery entries. Pending contact requests are introductions, not acceptance. Deduplicated requests live in socialAttention; an empty contactRequests array does not prove absence. Answer incoming pending requests by request ID: accept or decline only under current delegation. Outgoing pending requests await an answer; do not send another introduction. ALREADY_CONTACT means the introduction was rejected because the relationship already exists; it creates no new pending request or success. Existing contacts can receive ordinary messages subject to native checks. Contact acceptance is not trade consent or supply fulfillment; native authority and receipts still govern."
    : "";
  return `${rule}${social} ${rows.length ? `Local rates, whole/GAME hour: ${rows.join(";")}.` : "Local rates unavailable in this view."}`;
}
