import { existsSync, readFileSync } from "node:fs";
import type { RecallPort } from "./cognition.js";
import { FleetError, type GamePort, type ModelPort } from "./domain.js";
import { modelCallBound } from "./model-bounds.js";

/** Optional operator-owned wall-clock gate. It adds no request or token quota. */
export class RunWindow {
  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {}

  isOpen(): boolean {
    return this.hasTime(0);
  }

  private hasTime(requiredMs: number): boolean {
    if (!this.file) return true;
    try {
      if (existsSync(`${this.file}.closed`)) return false;
      const value = JSON.parse(readFileSync(this.file, "utf8"));
      const now = this.now();
      return (
        value.status === "running" &&
        Number.isSafeInteger(value.startsAt) &&
        Number.isSafeInteger(value.endsAt) &&
        [900_000, 1_800_000, 3_600_000, 21_600_000, 86_400_000].includes(value.endsAt - value.startsAt) &&
        now >= value.startsAt &&
        now + requiredMs < value.endsAt &&
        !existsSync(`${this.file}.closed`)
      );
    } catch {
      return false;
    }
  }

  assertOpen(): void {
    if (!this.isOpen()) throw new FleetError("RUN_WINDOW_CLOSED", true);
  }

  assertModelTime(model: Parameters<ModelPort["decide"]>[0]["model"]): void {
    this.assertOpen();
    if (!this.file) return;
    // A queued call must not begin just before this operator-owned window expires.
    // Keep the existing full provider bound plus the accounting margin; never extend the window.
    if (!this.hasTime(modelCallBound(model) + 1000)) throw new FleetError("RUN_WINDOW_MODEL_DRAINING", true);
  }

  model(provider: ModelPort): ModelPort {
    const estimate = provider.estimateInputTokens?.bind(provider);
    return {
      tracksDispatch: provider.tracksDispatch,
      contextWindow: (model) => provider.contextWindow?.(model),
      ...(estimate
        ? {
            estimateInputTokens: async (input: Parameters<NonNullable<ModelPort["estimateInputTokens"]>>[0]) => {
              this.assertModelTime(input.model);
              return estimate(input);
            },
          }
        : {}),
      decide: async (input) => {
        this.assertModelTime(input.model);
        return provider.decide({
          ...input,
          onDispatch: async () => {
            this.assertModelTime(input.model);
            await input.onDispatch?.();
            this.assertModelTime(input.model);
          },
        });
      },
    };
  }

  game(game: GamePort): GamePort {
    return {
      profile: () => game.profile(),
      tools: () => game.tools(),
      read: (tool, args) => game.read(tool, args),
      open: async () => {
        this.assertOpen();
        await game.open();
      },
      submit: async (commandId, action) => {
        this.assertOpen();
        return game.submit(commandId, action);
      },
      receipt: (commandId) => game.receipt(commandId),
      ...(game.effects
        ? {
            effects: (command: import("./domain.js").Data) =>
              game.effects?.(command) as Promise<import("./domain.js").Data>,
          }
        : {}),
      ...(game.submitGuarded
        ? {
            submitGuarded: async (command: import("./domain.js").Data, guard: import("./domain.js").Data) => {
              this.assertOpen();
              return game.submitGuarded?.(command, guard) as Promise<import("./domain.js").Data>;
            },
          }
        : {}),
      close: () => game.close(),
    };
  }

  recall(provider: RecallPort): RecallPort {
    return {
      choose: async (...args) => {
        this.assertOpen();
        return provider.choose(...args);
      },
    };
  }
}
