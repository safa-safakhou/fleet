import { CodexModel } from "./codex.js";
import { Cognition } from "./cognition.js";
import { config } from "./config.js";
import { connect } from "./db.js";
import { LegacyEngineBridge } from "./engines/legacy/bridge.js";
import { createPactEnvironment, PactBindings } from "./environments/pact.js";
import { pactAdapter } from "./games/pact/adapter.js";
import { CredentialBroker } from "./games/pact/credentials.js";
import { SyntheticOwner } from "./games/pact/owner.js";
import { LayaRecall } from "./laya.js";
import { HttpModel, RoutedModel } from "./model.js";
import { Bindings } from "./platform/bindings.js";
import { EnvironmentRegistry } from "./platform/environment-registry.js";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
export function runtime() {
  const settings = config(),
    pool = connect(settings.databaseUrl),
    store = new Store(pool, new Vault(settings.vaultKey));
  const broker = new CredentialBroker(store, settings.gameBase, settings.origin, settings.liveAllowed),
    model = new RoutedModel(new HttpModel(settings.routes, settings.apiKey), new CodexModel(settings.codex)),
    owner = new SyntheticOwner(store, broker);
  const bindings = new Bindings(store, settings.environment);
  const environments = new EnvironmentRegistry(
    [
      createPactEnvironment({
        store,
        bindings: new PactBindings(store, bindings),
        game: (id) => broker.game(id),
        now: store.now,
      }),
    ],
    settings.environment,
  );
  const cognition = new Cognition(store, new LayaRecall(settings.layaEndpoint));
  const engine = new LegacyEngineBridge(
    store,
    model,
    (id) => broker.game(id),
    settings.liveAllowed,
    pactAdapter,
    owner,
    undefined,
    cognition,
  );
  return { settings, pool, store, broker, engine, bindings, environments };
}
