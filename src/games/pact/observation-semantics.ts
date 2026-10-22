import { type Data, object } from "../../domain.js";
import { expandFactTables } from "../../fact-table.js";

const rule =
  "Supply needs actual external delivery/GAME window; stocks/allowances, local production, quotes/signatures are not proof.";
/** Current own canonical facts only; no goal evaluation, arithmetic or peer interpretation. */
export function pactNamedObservationSemantics(facts: Data): string {
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
  return `${rule} ${rows.length ? `Local rates, whole/GAME hour: ${rows.join(";")}.` : "Local rates unavailable in this view."}`;
}
