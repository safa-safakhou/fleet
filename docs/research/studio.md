# Research studio

Open Research studio in Fleet's console, then enter a recorded run identifier or a published experiment snapshot identifier. Turn debugging/history links first resolve the authorized recorded run identities; a turn UUID is not assumed to be a research run ID.

Stable links use #research/run/<encoded-run-id>?event=<event-id>, #research/turn/<turn-id> and #research/comparison/<experiment-snapshot-id>. Inspection uses the existing operator session and no-store research API. It never starts an agent, evaluation or game poll.

## Investigate a decision

1. Check the overview's manifest identity, frozen cutoff, coverage and unresolved work.
2. Inspect timeline pages, event-family/loaded-stream filters and loaded-event search. Pages contain200 events. Stream sequence and explicit parents establish ordering; UTC clocks can be skewed. Only recorded monotonic or reported measurements become duration labels.
3. Follow causal parents through the deterministic Dagre/SVG graph. Its viewport contains at most24 known nodes, with unavailable parents explicit. Up to100 explicitly expanded metadata records are cached. Expansions can cross the current page/filter boundary.
4. Select Context & lineage and explicitly load an artifact. Packet, schema, parameter, captured UTF8 text and lineage tabs retain their recorded role. Assembly packets and provider-boundary inputs are distinct. Spans highlight UTF8 byte ranges; omissions, transformations, classifications and mandatory coverage stay visible. Peer text is escaped plain text.
5. Inspect source references or compare recorded revisions. Cross-run reads require a real O2 dependency from a pinned artifact and original-run authorization/consent. This is not a global artifact lookup. Memory/state/skill views show recorded versions/transitions; adoption does not establish success.
6. Inspect the resolved manifest. Missing draft input means draft differences remain unavailable. Editing stays in the existing profile workflow.

Artifact requests return at most1MiB. Text windows render at most65,536 characters, with previous/next window and chunk controls. Partial/binary bodies are labelled; UTF8 display can replace split code points or binary bytes. Exact bytes remain in O5 archives.

Known snapshot/artifact/pinned-revision deadlines clear cached bodies. Authorization is rechecked on focus, interaction and a15-second inspection heartbeat. Revocation/expiry failures clear private state and abort pending requests; stale responses cannot refill a newer view. Logout/page-hide/unmount clear or dispose view state. Remote revocation without a push signal is discovered by the next check, not instantaneously.

## Resources and comparisons

Resources & outcomes reads already published A1 metric sets, with a bounded selector for the latest20 publications. It does not calculate business formulas or trigger evaluation. Metrics retain versions, units, populations, half-open windows, time bases, numerator/denominator, coverage, exclusions, evaluator digests and source references. Nulls have no bar and remain unavailable/unknown. Known tokens and unresolved reservations stay separate; monetary cost requires price evidence.

Historical summaries are separate from the current snapshot's per-allocation queue/service observations. Timing sample pages contain at most200 rows. Outcome views distinguish proposals/admission receipts from independent A1 completion. A final WAIT cannot erase earlier effects. Communication stages and explicit parent tables do not infer missing delivery/reply/agreement edges.

Comparisons show predeclared conditions, world-aware independent-unit counts, eligibility, per-run distributions, effect estimates and descriptive outcome/resource coordinates. Missing runs, configuration differences, exclusions and unknown coordinates remain visible. Ranking stays disabled; no automatic winner or promotion exists.

## Explicit exports

CSV/JSON view exports and SVG/PNG plot exports are separately requested decrypted outputs. They reauthorize the comparison and retain source/filter/coverage provenance. CSV neutralizes formula-leading text while retaining safe signed numbers. SVG includes structured metadata; PNG includes visible provenance captions. Use a private browser download destination. Saved external copies cannot be recalled by cache revocation.

For full evidence, prepare and separately save a private archive key, then save the complete encrypted archive to a private streaming file destination. Writer calls are bounded to1MiB; there is no full-archive Blob fallback. Browsers without the File System Access writer can still inspect/export views, but require a supporting browser for full archive writing. Browser fixtures test the stream protocol; native O5 tests separately verify encryption and exhaustive completeness.

## Reproduce

Use pinned Node26/npm12, npm ci, npx playwright install chromium, then npm run test:research-ui. The configuration runs1440×1000 and390×844 projects. The synthetic fixture has no database/provider/game client, refuses mutation/non-research API routes, disables dotenv loading and restricts serving to public client assets/dependencies and the metric catalog. A synthetic private-file canary tests the restriction.

Screenshots, exports, traces and performance JSON are ignored under .superpowers/sdd/2026-10-30-pact-research-06-studio/. FLEET_RESEARCH_UI_EXTERNAL=1, FLEET_RESEARCH_UI_BASE_URL and FLEET_RESEARCH_UI_OUTPUT support an explicitly owned external reference runner; never target retained services. [Performance provenance](studio-performance-20261031.json) and [implementation evidence](studio-20261031.md) record exact scope and limits.
