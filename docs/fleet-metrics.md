# Fleet metrics

Open the local Fleet console and select **Metrics**. Choose all fleets or one fleet and a rolling15-minute,1-hour,6-hour or 24-hour period. Values refresh every10 seconds. Operator authentication is required; polling metrics starts no workers, model calls or game commands.

- **Calls and confirmed actions:** counts over time, aggregated independently so multiple calls never multiply action counts. Action timestamps use completion; a turn that began before the period can still complete an action inside it.
- **Context usage:** each completed call's reported input tokens divided by its recorded provider context limit. This is a token percentage, separate from the logical request's byte limit. Output capacity is reserved separately before dispatch.
- **Output allowance:** reported output tokens divided by that call's requested output allowance. Thinking and final-answer generation share the allowance. Hover points for fleet/time/mode/error information.
- **Architecture totals:** calls and confirmed effects, with explicit numerical values and separate bars. An action summary is not a game effect.
- **Outcomes:** turn codes and structured command receipts. WAIT can include a committed action; the separate zero-effect count uses actual effects. Structured command receipts cover the platform path; older engines are covered by turn outcomes and run details.
- **Individual calls:** reported tokens, provider context, output allowance, thinking flag, elapsed time and final/error classification. Unknown usage, in-flight work and missing historical context are shown explicitly.

Totals cover the selected period. Individual-call charts/table show the latest 200 calls. Historical rows without context metadata remain unknown; no current context setting is silently projected onto old calls. The48 reported thinking-trial calls are measured; its one uncertain call has no measured token utilization.

Numeric operational metadata is recorded independently of observation consent. It contains no prompts, answers, private correspondence, credentials or reasoning text. Provider wrappers forward per-model context metadata; unavailable limits remain unknown. API filters are bounded and authenticated. Charts use local SVG with no external chart service or dependency and work under the existing content-security policy.

The local console installed26 October is on `http://127.0.0.1:56207`, with live execution disabled and no model API key. Its worker is a separate supervised process; keeping the console open does not resume cohorts or the world. Private sign-in details are retained outside Git. See the [thinking trial](thinking-fifteen-metrics-20261026.md) for actual run results and its remaining uncertainty.
