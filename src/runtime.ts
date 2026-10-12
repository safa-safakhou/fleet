import { CodexModel } from "./codex.js";
import { config } from "./config.js";
import { connect } from "./db.js";
import { Engine } from "./engine.js";
import { pactAdapter } from "./games/pact/adapter.js";
import { CredentialBroker } from "./games/pact/credentials.js";
import { SyntheticOwner } from "./games/pact/owner.js";
import { HttpModel, RoutedModel } from "./model.js";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
export function runtime() {
  const settings = config(),
    pool = connect(settings.databaseUrl),
    store = new Store(pool, new Vault(settings.vaultKey));
  const broker = new CredentialBroker(store, settings.gameBase, settings.origin, settings.liveAllowed),
    model = new RoutedModel(new HttpModel(settings.routes, settings.apiKey), new CodexModel(settings.codex)),
    owner = new SyntheticOwner(store, broker);
  const engine = new Engine(store, model, (id) => broker.game(id), settings.liveAllowed, pactAdapter, owner);
  return { settings, pool, store, broker, engine };
}
