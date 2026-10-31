import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
/** Kernel composition binds durable effect identities in the SAME native intent transaction. No network/worker callback. */
export type EffectHooks = {
  allocation?: (id: string, db: PoolClient) => Promise<void>;
  command?: (id: string, db: PoolClient) => Promise<void>;
};
const context = new AsyncLocalStorage<EffectHooks>();
export const effectHooks = () => context.getStore();
export const withEffectHooks = <T>(hooks: EffectHooks, work: () => Promise<T>) => context.run(hooks, work);
