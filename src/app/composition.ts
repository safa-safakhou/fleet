import { CodexModel } from "../codex.js";
import { Cognition } from "../cognition.js";
import type { config } from "../config.js";
import { connect } from "../db.js";
import { FleetError } from "../domain.js";
import { ContinuityModule } from "../engines/continuity/state.js";
import { LegacyEngineBridge } from "../engines/legacy/bridge.js";
import { currentLegacyClaim, legacyProfileFor } from "../engines/legacy/execution.js";
import { LegacyRunner } from "../engines/legacy/runner.js";
import { createPactEnvironment, PactBindings } from "../environments/pact.js";
import { pactAdapter } from "../games/pact/adapter.js";
import { CredentialBroker } from "../games/pact/credentials.js";
import { SyntheticOwner } from "../games/pact/owner.js";
import { LayaRecall } from "../laya.js";
import { HttpModel, RoutedModel } from "../model.js";
import { ModelAdmission, RouteCapacity } from "../platform/admission.js";
import { Bindings } from "../platform/bindings.js";
import { EngineRegistry } from "../platform/engine-registry.js";
import { EnvironmentRegistry } from "../platform/environment-registry.js";
import { EventIntake } from "../platform/event-intake.js";
import { CommandExecutor } from "../platform/execution.js";
import { OperationSupervisor, PlatformHost } from "../platform/supervisor.js";
import { TaskStore } from "../platform/tasks.js";
import { RunWindow } from "../run-window.js";
import { Store } from "../store.js";
import { Vault } from "../vault.js";
import { builtinArchitectures } from "./builtins.js";
import { compatibilityContextFor, createScopedServices, scopedOperationFor } from "./host-services.js";
import { createMaintenance } from "./maintenance.js";
import { ParticipantWork } from "./participant-work.js";
export function composeRuntime(settings: ReturnType<typeof config>) {
  const architectures = builtinArchitectures({
      "legacy-loop@1": (services) => legacyRuntime("legacy-loop", services),
      "legacy-cognition@1": (services) => legacyRuntime("legacy-cognition", services),
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
        actionEffectsVersion: settings.pactActionEffectsVersion,
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
  const tasks = new TaskStore(store, bindings, settings.maxConcurrency, environments),
    engines = new EngineRegistry([], architectures);
  function legacyRuntime(
    id: string,
    services: import("../platform/engine-context.js").ScopedServices,
  ): import("../platform/architecture.js").ArchitectureRuntime {
    return {
      route: () => [],
      run: async (scopedOperation) => {
        if (scopedOperation !== scopedOperationFor(services)) throw new FleetError("OPERATION_SCOPE_MISMATCH");
        const context = compatibilityContextFor(services);

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
    };
  }
  const admission = new ModelAdmission(store, tasks, model, capacity),
    commands = new CommandExecutor(store, tasks, bindings, environments),
    supervisor = new OperationSupervisor(tasks);
  const continuity = new ContinuityModule(tasks, bindings, cognition);
  const specialistContinuity = new ContinuityModule(tasks, bindings, cognition, {
    id: "specialist-coordinator",
    version: "1",
  });
  const intake = new EventIntake(tasks, bindings, environments);
  const participantWork = new ParticipantWork({
    store,
    tasks,
    bindings,
    environments,
    commands,
    enabled: () => settings.liveAllowed,
  });
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
    legacy: new LegacyRunner(store, engine),
    maintenance: createMaintenance(store),
    providerConfigured: (model: import("../domain.js").ModelSettings) =>
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
    participantWork,
  };
}
