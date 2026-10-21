import { Engine } from "../../engine.js";
import type { Claim } from "../../store.js";
import { withLegacyExecution } from "./execution.js";

/** Keep admission, lifecycle, reasoning, leases and reconciliation in the original controller. */
export class LegacyEngineBridge extends Engine {
  private readonly integrationId: string;

  constructor(...args: ConstructorParameters<typeof Engine>) {
    super(...args);
    this.integrationId = args[4].id;
  }

  override run(claim: Claim): Promise<void> {
    return withLegacyExecution(claim, this.integrationId, () => super.run(claim));
  }
}
