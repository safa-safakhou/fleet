import { CodexModel } from "./codex.js";
import { Cognition } from "./cognition.js";
import { config } from "./config.js";
import { connect } from "./db.js";
import { FleetError } from "./domain.js";
import { LegacyEngineBridge } from "./engines/legacy/bridge.js";
import { createPactEnvironment, PactBindings } from "./environments/pact.js";
import { pactAdapter } from "./games/pact/adapter.js";
import { CredentialBroker } from "./games/pact/credentials.js";
import { SyntheticOwner } from "./games/pact/owner.js";
import { LayaRecall } from "./laya.js";
import { HttpModel, RoutedModel } from "./model.js";
import { ModelAdmission, RouteCapacity } from "./platform/admission.js";
import { Bindings } from "./platform/bindings.js";
import { EngineRegistry } from "./platform/engine-registry.js";
import { EnvironmentRegistry } from "./platform/environment-registry.js";
import { CommandExecutor } from "./platform/execution.js";
import { currentLegacyClaim, legacyProfileFor } from "./platform/profiles.js";
import { OperationSupervisor, PlatformHost } from "./platform/supervisor.js";
import { TaskStore } from "./platform/tasks.js";
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
  const capacity = new RouteCapacity(store, (model) => ({
    key:
      model.route === "codex-cli"
        ? "codex-cli:process"
        : `${model.route}:${settings.routes[model.route] ?? "unconfigured"}`,
    capacity: 1,
  }));
  const capacityModel = capacity.wrap(model, currentLegacyClaim);
  const makeLegacyEngine = () =>
    new LegacyEngineBridge(
      store,
      capacityModel,
      (id) => broker.game(id),
      settings.liveAllowed,
      pactAdapter,
      owner,
      undefined,
      cognition,
    );
  const engine = makeLegacyEngine();
  const tasks = new TaskStore(store, bindings, settings.maxConcurrency),
    engines = new EngineRegistry();
  for (const id of ["legacy-loop", "legacy-cognition"])
    engines.register({
      ref: { id, version: "1" },
      requiredCapabilities: { timing: ["realtime"] },
      requiredSchemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
      observationOwner: "engine",
      async run(context) {
        if (!context.claim.turn.cohort.model || legacyProfileFor(context.claim.turn.cohort.model).id !== id)
          throw new FleetError("PROFILE_CONFIGURATION_MISMATCH");
        await new PactBindings(store, bindings).agentFor(context.binding);
        const operation = makeLegacyEngine(),
          stop = () => operation.stop();
        context.signal.addEventListener("abort", stop, { once: true });
        try {
          if (context.signal.aborted) stop();
          await operation.run(context.claim.turn);
        } finally {
          context.signal.removeEventListener("abort", stop);
        }
      },
    });
  const admission = new ModelAdmission(store, tasks, model, capacity),
    commands = new CommandExecutor(store, tasks, bindings, environments),
    supervisor = new OperationSupervisor(tasks);
  const host = new PlatformHost(tasks, bindings, environments, engines, admission, commands, supervisor);
  return { settings, pool, store, broker, engine, bindings, environments, tasks, engines, admission, commands, host };
}
