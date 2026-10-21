import { z } from "zod";
import type { Store } from "../store.js";
import type { EngineRegistry } from "./engine-registry.js";
import type { EnvironmentRegistry } from "./environment-registry.js";
import { LaunchService } from "./launch.js";
import type { TaskStore } from "./tasks.js";
export const ProfileRef = z.object({ id: z.string().min(1).max(100), version: z.string().min(1).max(40) }).strict();
export class ProfileConsole {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private environments: EnvironmentRegistry,
    private engines: EngineRegistry,
  ) {}
  private launcher() {
    return new LaunchService(this.store, this.tasks, this.environments, this.store.architectures, {
      liveAllowed: false,
      compatibilityEngines: this.engines,
    });
  }
  preview(raw: unknown) {
    return this.launcher().compatibilityPreview(raw);
  }
  catalog() {
    return this.launcher().compatibilityCatalog();
  }
  createProfileDraft(input: unknown) {
    return this.launcher().compatibilityDraft(input);
  }
  prepareStart(cohortId: string) {
    return this.launcher().compatibilityPrepareStart(cohortId);
  }
}
