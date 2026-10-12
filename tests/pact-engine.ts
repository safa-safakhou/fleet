import type { GamePort, ModelPort } from "../src/domain.js";
import { Engine as CoreEngine, type OwnerPort } from "../src/engine.js";
import { pactAdapter } from "../src/games/pact/adapter.js";
import type { Store } from "../src/store.js";
export class Engine extends CoreEngine {
  constructor(
    store: Store,
    model: ModelPort,
    game: (id: string) => Promise<GamePort>,
    live: boolean,
    owner?: OwnerPort,
  ) {
    super(store, model, game, live, pactAdapter, owner);
  }
}
