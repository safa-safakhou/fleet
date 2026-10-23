# Typed final-fact provenance repair — 23 October 2026

The user authorized fixing final provenance, one fresh bounded Nemotron 4B qualification, actual isolated disabled installation checks and an activation package for approval. Work is inline; game execution remains disabled and existing services/worlds remain preserved.

## Source change

The failed response knew the correct value but invented a locator in its final free-text wait summary. Read summaries, unresolved waits and action summaries were already structurally constrained, while known typed facts still allowed arbitrary final summaries. Prompt instructions alone did not enforce the final evidence boundary.

Opt-in `read-final.v3` now renders the final summary for typed fact requests from trusted fact IDs and delivered values:

```text
Observed requested facts: [{"id":"service.statusCode","value":"copper-318"}]
```

The generation schema requires the rendered summary, and the runtime rejects a provider bypass as `REQUESTED_FACT_SUMMARY_REQUIRED` before persistence. Fact IDs are labels supplied by the trusted adapter, not invented JSON paths. Unknown/blocked requests retain the existing unresolved summary and error. Tasks without typed requests retain their existing wait summaries; legacy v1/v2 are unchanged. Structured actions and native authorization retain their existing checks.

If complete known values would exceed the existing 400-character summary field, the summary points to the delivered `observation.requestedFacts` rather than truncating values into a misleading answer. Typed values remain intact and input admission still applies. This intentionally trades freeform final narration for truthful rendered results in the typed-fact contract; it is not a general semantic validator for other prose.

## Verification and execution boundary

The first regressions reproduced the original invented-path acceptance and the missing renderer. Focused checks now cover canonical known results, legitimate literal unknown-looking strings, unresolved requests, large-value reference fallback, and refusal before persistence. The real fake-HTTP integration rejects a fabricated path while accepting the canonical known answer.

Offline checks: 896 unit tests in 170 files, 63 isolated integration tests (57 specialist HTTP, five binding, one release preservation), type/style/build/boundaries, and a four-case network-forbidden preflight under the unchanged 13,000-byte ceiling. The HTTP suite also passed separately after the explicit invented-path grammar assertion. Existing 82 warnings / 56 informational diagnostics remain outside this change.

One fresh qualification will use at most six calls / ten minutes: status lookup/read/final (three), pending request (one), unavailable read (one), known literal (one). Stop on first failure, no retries or repair-and-rerun loop; only native pinned Nemotron 4B with thinking false. Old failures and unused allowances stay closed.

After qualification passes, actual installation checks use a separate private package, fresh owned database, loopback-only process, no worker/autostart/enrollment and `FLEET_LIVE_ENABLED=0`. The approval package will target only that isolated candidate service, retaining game execution disabled; no existing-world cutover or gameplay activation is included. This follows the user's instruction to keep game execution disabled throughout the work.
