# Reusable LLM/cognition comparisons

Fleet's **Comparisons** tab prepares two independent groups, defaulting to five agents in each. Group A uses the selected LLM without the structured cognition extension. Group B uses that same model, thinking/reasoning setting, interval and per-group allowance, with `llm-centered-v1` memory, reflection, persistent plans and peer beliefs. Optional `laya-recall-v1` orders retrieved evidence for B; the LLM retains all strategic decisions. VW remains unused. Disable Laya to compare cognition with deterministic recall instead.

This is a feature of Fleet, not a script tied to the Mac installation or Nemotron. Ollama, configured API providers and the existing Codex CLI route retain their own requirements. Templates contain model names and settings, not a downloaded model, provider endpoint, game credentials or an account transfer. Only PACT currently has real-game deployment acceptance; a new game still needs a reviewed adapter. See [game integration](game-integration.md), [cognition and Laya installation](cognition.md) and [provider setup](codex-provider.md).

## Prepare, export and save

1. Open **Comparisons**, name the setup, choose agents per group and an interval, and choose whether B uses Laya. Five agents and fifteen minutes are defaults, not a launch instruction. A shared seed gives each corresponding ordinal the same strategy preferences; five default profiles are balanced across each group.
2. Choose the shared LLM and an allowance **for each group**. A finite/daily allowance of 120 calls means at most 240 across the two groups per configured period. Continuous mode explicitly accepts no lifetime ceiling or deadline; individual turns/calls remain bounded. Existing accounting and unknown-usage recovery apply independently to each group.
3. **Preview comparison** validates configuration without saving controller records or calling any model/game service. Review the exact configuration and combined allowances. **Export template** downloads credential-free versioned JSON, usable through **Import a portable template** on another Fleet host.
4. **Save two inactive drafts** creates both groups atomically with new controller IDs. It creates no game accounts, grants, observation consent, schedule anchor, model execution or game action. Network retries with the same request ID and template return the original pair; a changed template with that ID is rejected. Never use an existing consumed cohort as an experimental baseline by resetting it.
5. Account connection/provisioning, authority and private observation remain explicit existing controls in each fleet. After connecting all accounts, **Start both fleets together** validates both groups and starts them atomically with one shared anchor. If either group is incomplete, neither starts. This initial paired launch requires both anchors to be unset; subsequent pause/resume uses existing per-fleet controls and preserves original anchors. Normal ownership/uniqueness prevents silently transferring accounts from another agent. A saved deadline can expire before launch; export/change/import a new plan instead of extending a consumed experiment. Inspect authority, host/helper readiness and initial game states before any real run.

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
| `POST /api/comparisons/:id/start` | Explicit initial launch of both connected groups in one transaction with identical anchors; normal live/account/budget/recovery guards apply. |

Template version 1 has `name`, `countPerArm` (default 5, 1–500), `intervalMinutes` (5/10/15/30/60), `seed`, `strategies`, shared `model`, per-group `budget`, and optional `recallAssist: "laya-recall-v1"`. Existing model/budget schemas enforce execution limits, Codex accounting and explicit continuous consent. The shared model must omit cognition, recall and decision-policy selectors; the comparison assigns the two modes. Strict validation refuses credentials, account bindings, endpoint URLs, start flags and VW. Exported finite deadlines are exact UTC instants and must be deliberately reviewed on import.

Installation uses normal Fleet build/migration commands, including additive `008_comparisons.sql` and `009_five_minute_schedule.sql`. The latter expands the interval constraint without modifying any existing row or schedule. Source installation does not authorize enrollment or execution. [Implementation/verification status](comparisons-20261014.md).

## Optional engine comparisons (F7 source)

[Engines & reports](profiles-and-reports-20261017.md) links existing groups without making a study mandatory or changing ownership/configuration. Existing paired templates are retained. Private evidence and shareable aggregate exports have separate boundaries and explicit coverage.

## Versioned research experiments

The research path adds preregistered `fleet.experiment/v1` specs and immutable `fleet.experiment-snapshot/v1` publications through `ExperimentRepository`/`ComparisonService`. Existing cohort links and comparison templates retain their historical meaning; no drafted study starts agents or changes selected profiles.

A spec declares its assignment unit, baseline, primary/secondary metric IDs, explicit world/session/cohort/run assignments, manifest digests, resource limits, shared half-open window/horizon, practical margin, fixed stopping rule, missingness policy, seed and frozen train/development/held-out fingerprints. Actual manifests, budgets, world identities and observation opportunities are checked and differences remain visible. Session assignment does not make shared-world sessions independent: reference clustering uses the sealed world incarnation. Truly independent sessions require separate isolated world incarnations. Paired comparisons resample matched independent blocks; incomplete pairs remain listed.

The reference bootstrap uses2,000 deterministic resamples with a recorded seed and percentile bounds. Ten independent units are required for the interval display (matched blocks for paired designs); smaller samples show descriptive estimates with `INSUFFICIENT_INDEPENDENT_UNITS`. This is an eligibility policy, not a power calculation. Worlds with both treatments signal interference. Missing, censored, unknown-usage, incomplete-evidence, post-hoc or mismatched data suppress inference. Missing bad runs cannot disappear from the declared population. Metrics aggregate within each world before resampling; repeated agents/turns do not increase the independent sample count.

Reports include per-world distributions, manifest difference paths, missing inputs, quality flags, paired/unpaired deltas and Pareto coordinates. `winner` always remains null. Publication/execution success does not establish effectiveness or authorize promotion.

Worked fixture:20 observations in baseline world A each score1 and20 in candidate world B each score2 yield a descriptive delta+1 with **two independent worlds**, no interval and no superiority conclusion. A matched fixture with baseline/candidate values10/12 and20/23 yields paired deltas2 and3, mean2.5; an unmatched third block is explicitly reported. Ten separate constant-score worlds produce the expected seeded degenerate interval[1,1], which demonstrates arithmetic only. The fixtures and method are frozen in the research statistics tests.

Study specs and bounded (at most1MiB plaintext) publications are encrypted in schema052. Authoritative Fleet metric/evidence references remain attached. Current operator/cohort authorization, original consent versions and source availability are checked on every read. Consent/source withdrawal invalidates private copies while minimal IDs/digests remain. An expired login or transient read failure cannot erase a valid publication. Late settlement produces a new snapshot; old snapshot bodies/digests do not change. Private expired copies are cleared by maintenance. These are controlled Fleet records, not unmanaged framework exports.

Authenticated, CSRF-protected research APIs provide metrics publication/read, experiment preregistration, snapshot publication and comparison read under `/api/research/`. Evaluator data is not added to actor capabilities. See [metric definitions](research/metrics.md) for populations, missingness and grading; installation/live behavior remains separately unqualified.
