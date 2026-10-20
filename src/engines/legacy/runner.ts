import type { Engine } from "../../engine.js";
import type { Claim, Store } from "../../store.js";
/** Preserved schedule/recovery lane for historical cohorts without a platform profile. */
export class LegacyRunner {
  constructor(
    private store: Store,
    private controller: Engine,
  ) {}
  claim(worker: string, capacity: number) {
    return this.store.claim(worker, capacity);
  }
  run(claim: Claim) {
    return this.controller.run(claim);
  }
  tick(worker: string, capacity: number) {
    return this.controller.tick(worker, capacity);
  }
  reconcile(turnId: string) {
    return this.controller.reconcile(turnId);
  }
  stop() {
    return this.controller.stop();
  }
}
