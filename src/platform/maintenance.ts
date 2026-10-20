import { FleetError } from "../domain.js";
export type MaintenanceHook = { id: string; run(limit: number, signal: AbortSignal): Promise<number> };
export class MaintenanceRegistry {
  private hooks = new Map<string, MaintenanceHook>();
  register(hook: MaintenanceHook) {
    if (this.hooks.has(hook.id)) throw new FleetError("DUPLICATE_MAINTENANCE");
    if (!hook.id || hook.id.length > 100 || this.hooks.size >= 32) throw new FleetError("MAINTENANCE_HOOK_LIMIT");
    this.hooks.set(hook.id, hook);
  }
  async run(limit: number, signal: AbortSignal) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new FleetError("INVALID_MAINTENANCE_LIMIT");
    const results: { id: string; code: string; processed: number }[] = [];
    for (const hook of this.hooks.values()) {
      if (signal.aborted) break;
      let abort: () => void = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(new FleetError("MAINTENANCE_ABORTED"));
        signal.addEventListener("abort", abort, { once: true });
      });
      try {
        const processed = await Promise.race([hook.run(limit, signal), interrupted]);
        if (!Number.isSafeInteger(processed) || processed < 0 || processed > limit)
          throw new FleetError("MAINTENANCE_BOUND_EXCEEDED");
        results.push({ id: hook.id, code: "OK", processed });
      } catch {
        results.push({
          id: hook.id,
          code: signal.aborted ? "MAINTENANCE_ABORTED" : "MAINTENANCE_FAILED",
          processed: 0,
        });
      } finally {
        signal.removeEventListener("abort", abort);
      }
    }
    return results;
  }
}
