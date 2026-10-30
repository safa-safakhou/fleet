import type { ArtifactStore } from "./artifacts.js";
/** Derived stores register deletion hooks; raw encrypted bytes are always removed first. */
export class EvidenceRetention {
  private hooks = new Map<string, (now: Date) => Promise<void>>();
  constructor(private artifacts: ArtifactStore) {}
  register(name: string, hook: (now: Date) => Promise<void>) {
    if (this.hooks.has(name)) throw Error("RETENTION_HOOK_DUPLICATE");
    this.hooks.set(name, hook);
  }
  async expire(now: Date) {
    const report = await this.artifacts.expire(now);
    for (const hook of this.hooks.values()) await hook(now);
    return report;
  }
}
