# Game integration boundary

Fleet is reusable scheduling and model infrastructure with one reviewed game integration per deployment. PACT is the first supported real game. Running on any other real game requires implementing and testing its integration; choosing another URL alone is insufficient.

`src/game.ts` defines `GameAdapter`. It supplies initial authenticated observations, game instructions, read admission, action-schema lookup, bounded context/memory projections, peer discovery/observation communication normalization and game-specific rejection/owner-fallback classification. `GamePort` in `src/domain.ts` supplies account identity, tools, reads, write-session admission, exact commands and receipts. `ModelPort` is independent of both and supplies decisions plus usage. The core enforces server-declared read-only annotations even if an adapter erroneously admits a write tool.

P1 additions: `narrowRead` produces explicit, actionable incomplete feedback when a requested result exceeds the transport allowance; cached history cannot replace that result. `applyRead` updates integration-owned preflight observations after a new authorized read. `attention` supplies consented inspection guidance without granting recovery authority. The optional capability matrix describes routes and observed restrictions; actual server handlers remain authoritative. Checkpoints remain encrypted arrays, capped at eight entries / 24,000 bytes; adapters choose their retention categories. The last requested read can carry a `requested` delivery marker until a valid decision consumes it, including across scheduled turns/restart. [Verification and compatibility limits](p1-controller-20261013.md).

Implement an adapter under `src/games/<game>/`, its credential enrollment and authenticated game transport. The composition in `src/runtime.ts` wires it and any explicitly reviewed owner exception port. Configure the console's game-specific enrollment and agreement presentation accordingly. Add the game to configuration only after these pieces are accepted. Never reuse the PACT credential broker or owner policy for another game. Use a separate database, vault and state directory for that game's deployment.

The game server owns its rules and authority. Fleet never reads a game's database, grants itself permissions, replaces uncertain command IDs or infers success from prose. A model sees only authorized observations and reviewed tools. Schema changes, identity mismatch, ambiguous transport, revocation, claim fencing, terminal deadlines and budgets must have meaningful adapter acceptance tests.

The SQL/API compatibility fields `kingdom_id` and `peer_kingdom_id` retain the existing PACT identities and history. Migration013 adds `environment_bindings` with opaque account/actor/entity strings; it never rewrites the legacy UUIDs or vault associated-data identity. Control remains exclusive per environment instance/entity, including terminal agents. The legacy controller still reads its old fields; the new task host consumes generic bindings. The existing strategy presets and agreement UI retain their compatibility behavior.

`src/platform/contracts.ts` defines `EnvironmentAdapter`/`EnvironmentSession`, capability requirements and typed envelopes. `EnvironmentRegistry` statically selects an exact reviewed adapter/version/instance and rejects incompatible capabilities/schemas before connection/model work. `src/environments/pact.ts` wraps the existing authenticated game ports and credential ownership. Current PACT capabilities explicitly have no autonomous event feed or parallel within-actor reasoning. Source references include environment/version/instance and actor/entity scope. Unknown/missing outcomes never authorize replay.

Defaults retain PACT version1 and use the normalized game base URL as instance ID. `FLEET_ENVIRONMENT_ID`, `FLEET_ENVIRONMENT_VERSION` and `FLEET_ENVIRONMENT_INSTANCE` explicitly select the deployed reviewed integration; they do not load arbitrary code or enroll accounts. PACT remains the only real integration composed in `runtime.ts`; another real environment needs its reviewed adapter, credential enrollment, presentation and acceptance. Adapters supply their own labels/default goals and optional trusted existing-account enrollment hook. These are integration services, not model tools. The board fixture needs no social behavior. [F2 acceptance and migration proof](environment-bindings-20261017.md).

`npm run check:boundaries` rejects game/environment-module imports, PACT tool names and PACT artifacts in core modules and recursively in all platform/engine TypeScript directories. The stateful synthetic board-game integration tests run the same engine, ledger and receipt flow with different reads/actions and verify identity and read-authority rejection. Linux acceptance separately exercises the actual Codex process fixtures without real inference.


## Durable host path

[Phase1 host acceptance](platform-host-20261017.md) describes explicit fresh-cohort enrollment, static `AgentEngine` registration, durable task/source/turn fences, fair task-cohort admission, per-operation stop/drain and shared model/command services. Generic engines consume `EngineContext`; they do not receive a game database, credentials or a way to expand their own execution policy. Compatibility engines retain their own observation/accounting flow and use a capacity-only provider port. Real route capacity remains one pending separate qualification; the original Codex process lock remains.

Commands retain their original internal UUID, encrypted intent and existing receipt archive. A known non-dispatch rejection can replan; unknown usage or action delivery retains its allocation/pending ID and concrete recovery gate. The cursor table is storage groundwork; current PACT still advertises no event feed. Feed polling, resync, enrollment and reactive profiles are later work. The phase1 source has not been installed into the existing runtimes.

## Event-aware profiles

See [F4 intake and reactive profile](reactive-engine-20261017.md) for explicit new-cohort wake enrollment, bounded polling/cursor resync and `pact.agent-events.v1`. Event metadata never grants model/action authority. Existing environments without a reviewed feed remain `events:none`; no human stream fallback.

## Optional structured coordination — F6

[Coordinator contract](specialist-coordinator-20261017.md) requires an environment-owned claim validator and atomic expected-revision enforcement. Parallel reasoning is separately negotiated. Existing PACT integration does not advertise this capability; no inferred game permissions, local economy arithmetic or real independent-submit broker is supplied.

## Adapter/profile qualification

[F8](profile-qualification.md) reviews exact profile, environment instance, adapter descriptor, source/configuration digests and separate fake/real evidence. See the [compatibility matrix](multi-engine-compatibility-20261017.md). A capability preview alone is insufficient; another adapter needs actual handler/permission/receipt and failure-path acceptance. No provider route or live profile is certified by synthetic tests.

## Trusted controller instructions and standing objectives

A registered `EnvironmentAdapter` can supply optional static `instructions`. The host forwards these separately from observation/peer text into the engine's system instructions; reactive-basic and reactive-cognition consume them. An absent field preserves the existing packet. Do not promote tool output or another player's prose into this field. An optional `accountObjective(observation)` callback extracts only the authenticated current owner objective from the fresh owned view. The host forwards it separately; modern controllers refresh the actual assignment after reads rather than using only a generic default goal. Neither hook grants permission.

PACT supplies the same controller contract used by the legacy integration: a current owner objective supplies standing guidance for already delegated actions, and Fleet handles the MCP write lease, command IDs and receipts. External MCP-client instructions about opening a lease describe a host responsibility in Fleet. Human-only actions, mandate bounds, freshness and server admission remain enforced.

`agentBriefing` is a factual, protected observation component, retained by `compactFacts`/`compactEnvironment`. It exposes the fresh owned objective/status and observed construction queue/prerequisite/stock/busy facts, with unknowns explicit. It does not select an action/partner or establish a new authority system. Scoped reads retain surrounding fresh owner/world context and a separate requested answer, rather than replacing the model's owner goal with the answer alone. See [the autonomous-work repair](autonomous-work-repair-20261019.md).
