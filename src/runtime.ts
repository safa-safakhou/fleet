import { composeRuntime } from "./app/composition.js";
import { config } from "./config.js";
export function runtime() {
  return composeRuntime(config());
}
