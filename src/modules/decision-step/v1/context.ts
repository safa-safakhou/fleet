import type { ScopedOperation, ScopedServices } from "../../../platform/engine-context.js";
export type DecisionContext = ScopedOperation &
  ScopedServices &
  ScopedServices["environment"] & { goal?: string; instructions?: string; waitForEvent?: () => Promise<void> };
export function decisionContext(operation: ScopedOperation, services: ScopedServices): DecisionContext {
  return {
    ...services,
    ...services.environment,
    ...operation,
    goal: services.configuration.goal,
    instructions: services.configuration.instructions,
    waitForEvent: services.tasks.waitForEvent,
  };
}
