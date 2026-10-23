# Owner task and profile proposal — 24 October 2026

**Status: proposal prepared, not approved for activation, not runnable.** The user authorized proposal preparation only, inline, Nemotron 4B only, game execution disabled, no worker/model calls and E4/KQ1 blocked. No installed settings, accounts, profiles, bindings, tasks or schedules were created or changed. No API draft/launch endpoint was invoked.

Machine-readable artifact: [owner-clock-read.v1](proposals/owner-clock-read-profile-20261024.json), SHA-256 `974ad870b3c0e045f5e5d17358e733357c2f333b177b1fed01ed9eca2ad5d04a`. This is a proposal envelope containing native configuration components; it is not an API launch payload or an environment file to apply.

## Recommended owner task

My proposed first owner objective is **report the current authenticated kingdom's observed game time**. This gives the repaired read-to-answer path a concrete native PACT field without choosing economic, diplomatic or military policy for the owner. The owner has requested this proposal; the objective itself is a recommendation pending review, not a standing mandate.

Address one task, `owner-clock-read.v1`, to the resources specialist:

> Retrieve the current `asOfGameTimeMs` from the authorized self-scoped `pact_world_read_v1` result with `forecastMinutes: 60`. Report the exact observed value through the typed requested fact `world.time`. Inspect the native argument schema if necessary. Do not infer elapsed time, contact peers, change state or claim a read completed before its result. If unavailable or out of allowance, return the existing honest unresolved result.

Trusted operator request component:

```json
{
  "entityRef": "11111111-1111-4111-8111-111111111111",
  "id": "world.time",
  "tool": "pact_world_read_v1",
  "args": { "forecastMinutes": 60 },
  "path": ["asOfGameTimeMs"]
}
```

The entity ID above is **synthetic example data**, not an enrolled kingdom, credential or authorization. Future real entity selection must derive from an authenticated binding under explicit scope. This task requires no peer identifier and adds no read capability absent from the native authorized catalog. `forecastMinutes: 60` is an existing native read argument, not permission to advance a clock. The result is game time, not evidence of wall-clock time or completion of another goal.

Success requires one matching targeted result and its exact typed JSON value in the canonical final wait summary. For the synthetic value used by validation, the result is:

```text
Observed requested facts: [{"id":"world.time","value":1792419240000}]
```

A metadata lookup or unrelated/bootstrap observation cannot complete the request. Preserve the delivered value's JSON type; do not coerce it or invent a source locator. If blocked or unresolved, use the native summary `Requested facts remain unresolved; no result is asserted.` and mark the task incomplete. Honest incompletion is safe handling, not successful retrieval.

The one-shot task must produce no action intent, messages, wake schedule, persistent goal update or claims that game actions occurred. Any later fixture acceptance envelope is memory/fixture-only; installed goals and pending work remain untouched.

## Profile components

| Component | Proposed setting |
| --- | --- |
| Architecture | `autonomous-specialists`, version `1` |
| Native preset | `resources-diplomacy`; existing two roles preserved |
| Addressed role | `resources`, one one-shot task; diplomacy not scheduled |
| Decision/read contracts | `read-final.v3`, `environment.v4` |
| Other exact options | `participantContract: scoped.v1`, `contextPackingContract: required-first.v1`, `responseContract: visible.v1` |
| State and skills | `maxActiveGoals: 1`, `memoryBytes: 6000`, `learning: false`, `skillMode: off` |
| Model | `nemotron-3-nano:4b`, native Ollama at `http://127.0.0.1:11434`, thinking false, context 16,384 tokens; no fallback |
| Model digest | `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197` |
| Installed source basis | Fleet `966f2d2069d027cb382b67beba70aef30a228ff8` |

No arbitrary custom preset or charter override is claimed. The native preset includes resources and diplomacy, and native immutable charters retain their own allowed actions. Owner text and these profile options alone do not make those charters read-only. A future isolated rehearsal must explicitly address only resources, disable recurring/event scheduling and offer an empty executable action catalog/port, rejecting any action intent before persistence or dispatch. That boundary is a **required offline proof**, not a feature implemented or activated by this document.

## Proposed future ceilings, not a current grant

Current authority remains **zero model calls, workers and game commands**. The following only defines a possible later separately approved one-shot rehearsal:

- At most **three model calls / five minutes**, 90 seconds per call, no retries, stop on first failure. No repair-and-rerun loop.
- Native finite budget template: 49,152 total reserved tokens, 16,384 per call, 1,024 output tokens, 13,000 input bytes, three calls per turn, concurrency one. Every proposed call is fully reserved. Unknown usage retains its reservation and stops the study.
- At most three observation requests (initial, optional schema, targeted read), one targeted fact read, **13 native `game.read` calls** and **16 tool-catalog lookups** in the proposed minimal fixture. These are proposed hard limits to prove offline, not measured use or an assumed allowance from an old grant.
- The native adapter bootstraps four reads per observation: guide, world, development guide and diplomacy guide. Three observations plus one targeted read imply 13 reads when optional discovery/attention/outlook capabilities are absent from that fresh fixture. If the fixture needs additional calls, stop and revise the proposal before any trial; do not silently add permissions or hide bootstrap reads. This restriction is for a synthetic fixture, not permission to filter or expand a real owner's native view.
- **Zero actions, peer messages, worker starts, scheduled runs or installed-state changes.** The native budget schema has `maxActionsPerTurn >= 1`; the component therefore uses one for schema validity. It is not a one-action grant. An independently proven missing executable action port and pre-dispatch refusal must enforce the actual zero-action ceiling.
- The absolute UTC deadline, fresh authenticated fixture identifiers and exact package/packet hashes must be frozen before any later approval. They are not fabricated now. The old completed six-call allowance stays closed.

Input and context ceilings are unchanged from prior qualification. The production adapter packet may differ from the earlier synthetic observation; prove fit offline rather than raising the ceiling or assuming qualification transfers.

## Alternatives considered

Reusing the earlier synthetic service-status task would add little native-adapter coverage. A pending-contact or social task introduces peer scope, action proposals and more acceptance dimensions. The native clock read is the smallest concrete next task that connects the existing operator-request parser, authenticated adapter and v3 final-answer contract. This is a recommended proposal, not activation of any alternative.

## Offline validation performed

Seventeen pure checks passed against the installed candidate's real parser/manifest/schema modules: architecture configuration, model, finite budget, full reservation, exact operator-request grammar, scoped synthetic fact transitions, canonical known output, honest unavailable output and synthetic native launch-spec component assembly. The validator checked a foreign synthetic entity receives no requested fact. No database, provider, HTTP model route, worker or launch service was used.

The validator initially quoted the unresolved summary incorrectly; its assertion was corrected to the actual existing contract above. No application behavior was changed. A synthetic absolute deadline and synthetic actor ID existed only in validation memory to exercise native schemas; neither was saved as a grant, actual roster or API payload.

This is **schema/component acceptance**, not a complete integrated harness test, authenticated native-server test, model trial or live launch-readiness check. The existing native launch service also refuses execution while `FLEET_LIVE_ENABLED=0`; no bypass is proposed. Its ready state was not queried or inferred.

Private validation: `/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/owner-clock-proposal-validation-20261024.json`; SHA-256 `39365185b28d79253110eccc6ee3b7cdde32f7b6391aaf5c2b569d912adc2226`. Private script and raw evidence remain outside Git.

## Remaining gates before any rehearsal or activation

1. Review this owner objective and profile proposal. No identity, native preset rewrite or new message/action allowance may be inferred from accepting the objective.
2. Implement and run one bounded **offline** composition rehearsal in fresh owned fixtures: production request parsing → authenticated native adapter → addressed resources task → v3 final acceptance. Fake provider only. Prove empty action contracts/port, pre-dispatch intent denial, inactive diplomacy/schedules, exact read/catalog counters, unchanged installed state and 13,000-byte packet admission. This integrated fixture does not exist merely because component validation passed.
3. Freeze the exact successful fixture/candidate and real budget/deadline before proposing any new model trial. If a trial is justified, obtain separately bounded authorization; Nemotron 4B only. No trial has been scheduled or run.
4. Installed-world enrollment, worker startup, ordinary-instance cutover, autostart and game activation remain outside this proposal. E4/KQ1 remain blocked. Keeping game execution disabled is compatible with preparing/proving a game-free harness; it is not permission to launch the existing native profile.

Recommended next work is the offline composition proof in step 2, with a 30-minute total ceiling and a report before any model calls or installed activation. Stop at the limit and report an exact gap rather than extending scope.
