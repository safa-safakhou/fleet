import { readFileSync } from "node:fs";
import type { RecallPort } from "./cognition.js";
import { FleetError, type GamePort, type ModelPort } from "./domain.js";

/** Optional operator-owned wall-clock gate. It adds no request or token quota. */
export class RunWindow {
  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {}

  isOpen(): boolean {
    if (!this.file) return true;
    try {
      const value = JSON.parse(readFileSync(this.file, "utf8"));
      const now = this.now();
      return (
        value.status === "running" &&
        Number.isSafeInteger(value.startsAt) &&
        Number.isSafeInteger(value.endsAt) &&
        [1_800_000, 3_600_000].includes(value.endsAt - value.startsAt) &&
        now >= value.startsAt &&
        now < value.endsAt
      );
    } catch {
      return false;
    }
  }

  assertOpen(): void {
    if (!this.isOpen()) throw new FleetError("RUN_WINDOW_CLOSED", true);
  }

  model(provider: ModelPort): ModelPort {
    return {
      tracksDispatch: provider.tracksDispatch,
      decide: async (input) => {
        this.assertOpen();
        return provider.decide({
          ...input,
          onDispatch: async () => {
            this.assertOpen();
            await input.onDispatch?.();
            this.assertOpen();
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
