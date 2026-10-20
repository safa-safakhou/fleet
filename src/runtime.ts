import { builtinArchitectures } from "./app/builtins.js";
import { compatibilityRuntime, createScopedServices, scopedOperationFor } from "./app/host-services.js";
import { CodexModel } from "./codex.js";
import { Cognition } from "./cognition.js";
import { config } from "./config.js";
import { connect } from "./db.js";
import { FleetError } from "./domain.js";
import { ContinuityEngine } from "./engines/continuity/engine.js";
import { ContinuityModule } from "./engines/continuity/state.js";
import { LegacyEngineBridge } from "./engines/legacy/bridge.js";
import { currentLegacyClaim, legacyProfileFor } from "./engines/legacy/execution.js";
import { ReactiveEngine } from "./engines/reactive/engine.js";
import { SpecialistCoordinatorEngine } from "./engines/specialists/coordinator.js";
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
import { EventIntake } from "./platform/event-intake.js";
import { CommandExecutor } from "./platform/execution.js";
import { OperationSupervisor, PlatformHost } from "./platform/supervisor.js";
import { TaskStore } from "./platform/tasks.js";
import { RunWindow } from "./run-window.js";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
export function runtime() {
  const settings = config(),
    architectures = builtinArchitectures({
      "legacy-loop@1": (services) =>
        compatibilityRuntime(services, () => engines.resolve({ id: "legacy-loop", version: "1" })),
      "legacy-cognition@1": (services) =>
        compatibilityRuntime(services, () => engines.resolve({ id: "legacy-cognition", version: "1" })),
      "reactive-basic@1": (services) => compatibilityRuntime(services, () => new ReactiveEngine()),
      "reactive-cognition@1": (services) =>
        compatibilityRuntime(services, () => new ContinuityEngine(new ContinuityModule(tasks, bindings, cognition))),
      "specialist-coordinator@1": (services) =>
        compatibilityRuntime(
          services,
          () =>
            new SpecialistCoordinatorEngine(
              new ContinuityModule(tasks, bindings, cognition, { id: "specialist-coordinator", version: "1" }),
            ),
        ),
    }),
    pool = connect(settings.databaseUrl),
    store = new Store(pool, new Vault(settings.vaultKey), undefined, architectures);
  const runWindow = new RunWindow(settings.runWindowFile);
  const broker = new CredentialBroker(store, settings.gameBase, settings.origin, settings.liveAllowed),
    model = runWindow.model(
      new RoutedModel(new HttpModel(settings.routes, settings.apiKey), new CodexModel(settings.codex)),
    ),
    owner = new SyntheticOwner(store, broker);
  const game = async (id: string) => runWindow.game(await broker.game(id));
  const bindings = new Bindings(store, settings.environment);
  const environments = new EnvironmentRegistry(
    [
      createPactEnvironment({
        store,
        bindings: new PactBindings(store, bindings),
        game,
        now: store.now,
        eventFeedVersion: settings.pactEventFeedVersion,
        outlookVersion: settings.pactOutlookVersion,
      }),
    ],
    settings.environment,
  );
  const cognition = new Cognition(store, runWindow.recall(new LayaRecall(settings.layaEndpoint)));
  const capacity = new RouteCapacity(store, (model) => ({
    key:
      model.route === "codex-cli"
        ? "codex-cli:process"
        : `${model.route}:${settings.routes[model.route] ?? "unconfigured"}`,
    capacity: 1,
  }));
  const capacityModel = capacity.wrap(model, currentLegacyClaim);
  const makeLegacyEngine = () =>
    new LegacyEngineBridge(store, capacityModel, game, settings.liveAllowed, pactAdapter, owner, undefined, cognition);
  const engine = makeLegacyEngine();
  const tasks = new TaskStore(store, bindings, settings.maxConcurrency),
    engines = new EngineRegistry([], architectures);
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
  engines.register(new ReactiveEngine());
  const continuity = new ContinuityModule(tasks, bindings, cognition);
  engines.register(new ContinuityEngine(continuity));
  const specialistContinuity = new ContinuityModule(tasks, bindings, cognition, {
    id: "specialist-coordinator",
    version: "1",
  });
  engines.register(new SpecialistCoordinatorEngine(specialistContinuity));
  const intake = new EventIntake(tasks, bindings, environments);
  const host = new PlatformHost(
    tasks,
    bindings,
    environments,
    engines,
    admission,
    commands,
    supervisor,
    async (context, definition, session) => {
      const services = await createScopedServices(context.claim, definition, session, {
        context,
        store,
        tasks,
        bindings,
        model: admission,
        commands,
      });
      return { services, operation: scopedOperationFor(services) };
    },
  );
  return {
    settings,
    providerConfigured: (model: import("./domain.js").ModelSettings) =>
      model.route === "codex-cli" ? Boolean(settings.codex.executable) : Boolean(settings.routes[model.route]),
    runWindow,
    continuity,
    specialistContinuity,
    pool,
    store,
    broker,
    engine,
    bindings,
    environments,
    tasks,
    engines,
    architectures,
    admission,
    commands,
    host,
    intake,
  };
}
