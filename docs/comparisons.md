# Reusable LLM/cognition comparisons

Fleet's **Comparisons** tab prepares two independent groups, defaulting to five agents in each. Group A uses the selected LLM without the structured cognition extension. Group B uses that same model, thinking/reasoning setting, interval and per-group allowance, with `llm-centered-v1` memory, reflection, persistent plans and peer beliefs. Optional `laya-recall-v1` orders retrieved evidence for B; the LLM retains all strategic decisions. VW remains unused. Disable Laya to compare cognition with deterministic recall instead.

This is a feature of Fleet, not a script tied to the Mac installation or Nemotron. Ollama, configured API providers and the existing Codex CLI route retain their own requirements. Templates contain model names and settings, not a downloaded model, provider endpoint, game credentials or an account transfer. Only PACT currently has real-game deployment acceptance; a new game still needs a reviewed adapter. See [game integration](game-integration.md), [cognition and Laya installation](cognition.md) and [provider setup](codex-provider.md).

## Prepare, export and save

1. Open **Comparisons**, name the setup, choose agents per group and an interval, and choose whether B uses Laya. Five agents and fifteen minutes are defaults, not a launch instruction. A shared seed gives each corresponding ordinal the same strategy preferences; five default profiles are balanced across each group.
2. Choose the shared LLM and an allowance **for each group**. A finite/daily allowance of 120 calls means at most 240 across the two groups per configured period. Continuous mode explicitly accepts no lifetime ceiling or deadline; individual turns/calls remain bounded. Existing accounting and unknown-usage recovery apply independently to each group.
3. **Preview comparison** validates configuration without saving controller records or calling any model/game service. Review the exact configuration and combined allowances. **Export template** downloads credential-free versioned JSON, usable through **Import a portable template** on another Fleet host.
4. **Save two inactive drafts** creates both groups atomically with new controller IDs. It creates no game accounts, grants, observation consent, schedule anchor, model execution or game action. Network retries with the same request ID and template return the original pair; a changed template with that ID is rejected. Never use an existing consumed cohort as an experimental baseline by resetting it.
5. Account connection/provisioning, authority, private observation and starting each group remain explicit existing controls in each fleet. Normal ownership/uniqueness prevents silently transferring accounts from another agent. A saved deadline can expire before launch; export/change/import a new plan instead of extending a consumed experiment. Inspect authority, host/helper readiness and initial game states before any real run.

Saving or importing does not install a provider/helper or start a worker. If Laya abstains or is unavailable, the cognition group retains deterministic recall. The comparison report distinguishes accepted recall pairs from actual delivery, abstention and unavailable assistance, so a nominal Laya selection is not presented as successful Laya usage. Basic controller notes, retained read cache, current game facts and recovery feedback remain in both groups; “LLM only” does not mean an empty prompt.

## Inspect results

Choose a saved comparison to see both groups' states, account readiness, actual start anchors, turns, committed actions, waits, pending commands, execution counts and charged/reported/unknown usage. Dialogue and cognition telemetry require separately selected private observation consent. Off/missing telemetry is visibly unmeasured. Analysis counters count accepted belief revisions and reflections, not merely proposed `updated` labels; duplicates and Laya acceptance/delivery are separate. **Inspect fleet & agents** opens the existing evidence inspector and turn history.

The template remains the original selection. A later editable-draft configuration or strategy change produces a visible mismatch rather than changing the experiment's label. Reports use one read-only repeatable database snapshot. Action/usage counters are lifetime counts; dialogue/event telemetry follows existing thirty-day retention and cannot reconstruct previously unconsented turns. Field counts, more actions or a delivered recall pair are not evidence of intelligent play. Compare source-grounded hypotheses, uncertainty, verified outcomes, revised plans and actual decisions. Different start times, authority, kingdoms, resources, peers and interaction between groups can confound a comparison. No random assignment, equal world-state guarantee, winner or automatic intelligence score is supplied.

## Operator API

All routes require the existing private operator login. POSTs require the configured origin and CSRF token. Responses are private/no-store.

| Route | Behavior |
| --- | --- |
| `POST /api/comparisons/preview` | Validate a template and show both selections/combined allowances; no writes/external calls. |
| `POST /api/comparisons` | Body `{requestId: <fresh UUID>, template: <validated template>}`; save two inactive drafts atomically. Retry an unknown outcome with identical arguments/UUID. |
| `GET /api/comparisons` | Latest 100 saved comparison identities. |
| `GET /api/comparisons/:id` | Original exportable template, current selections/mismatch, actual counters and consented telemetry. |

Template version 1 has `name`, `countPerArm` (default 5, 1–500), `intervalMinutes` (10/15/30/60), `seed`, `strategies`, shared `model`, per-group `budget`, and optional `recallAssist: "laya-recall-v1"`. Existing model/budget schemas enforce execution limits, Codex accounting and explicit continuous consent. The shared model must omit cognition, recall and decision-policy selectors; the comparison assigns the two modes. Strict validation refuses credentials, account bindings, endpoint URLs, start flags and VW. Exported finite deadlines are exact UTC instants and must be deliberately reviewed on import.

Installation uses normal Fleet build/migration commands, including additive `008_comparisons.sql`. Source installation does not authorize enrollment or execution. [Implementation/verification status](comparisons-20261014.md).
