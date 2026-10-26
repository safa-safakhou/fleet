# Doubled input allowance: Nemotron 4B comparison

The owner authorized doubling the request limits without changing models. The world remained paused. Work was inline, without GUI or delegation; E4/KQ1 remained blocked.

**Interpretation corrected by the [six-response audit](six-wait-response-audit-20261025.md):** all six actual inputs explicitly described a paused world, and all six responses waited for it to become active. Native game admission blocks the relevant actions while paused. Their waits were therefore justified for the supplied states; this comparison cannot assess active-play passivity. Accepted factual bases do not certify every explanatory sentence or the mismatched `resource_reserve` reason label.

## Settings and preservation

Fleet input allowance increased from **32,000 to 64,000 logical bytes** through its existing audited `increaseInputAllowance` method for **20 paused, eligible cohorts**. Four cohorts retain 32,000 bytes because the method refuses unresolved execution/usage: three autonomous-specialist cohorts and one coordinator cohort. Their holds were not reviewed or cleared.

Only the input allowance and the method's audited generation increment changed. Models, output allowances, call/action limits, total budgets, schedules/anchors, mandates, retained history and original unknown usage remain unchanged. The retained world still has 941 turns and 832 ledger allocations. The latest source catalog correction is used in this comparison; no worker deployment or game continuation occurred.

Two isolated providers used the same hash-verified Nemotron 4B weights, tokenizer, reasoning mode, Guidance backend, four configured sequence slots and 94 physical cache blocks. The first retained the 16,384-token context. After tokenizer admission rejected the three larger v1.1 inputs, only the provider context was doubled to **32,768 tokens** for those remaining cases. The output allowance stayed 1,536 tokens. These were serial calls, not a four-concurrent-request benchmark.

## Offline result

Six current paused-data reconstructions fit at both byte allowances using read-only connections and throwing inference boundaries:

| Profile | Input bytes at 32,000 allowance | Input bytes at 64,000 allowance | Delivered evidence items |
|---|---:|---:|---:|
| Original v1, three actors | 31,704–31,714 | 52,942–52,948 | 1 → 4 |
| V1.1, three actors | 31,949–31,969 | 58,502–58,904 | 1 → 4 |

The larger allowance leaves approximately 5–11 KB spare in these inputs. The deliberately heavier queued v1 case, rejected before inference at 32,000 bytes, passes the complete synthetic runtime at 64,000. The permanent regression now covers both outcomes, including actual HTTP stream parsing and accounting with a fake provider.

An isolated replay of the existing native v2 workflows with the complete production catalog and 64,000 bytes also passed all four checks: prerequisite construction, introduction, messaging and subsequent prerequisite/Hall completion. These used fresh synthetic databases and fake inference. The one-off test source and output are preserved privately; the temporary repository copy was removed after checking its hash. Its initial completion assertion assumed eight selected profiles despite this diagnostic selecting one; that fixture assertion was corrected before the four-case pass. No runtime implementation was changed to obtain it.

Verification: five affected integration checks, the separate four-case v2 diagnostic, type/style check (existing warnings/information), architecture boundaries and whitespace checks. No broad unit rerun was needed for this supported configuration change.

## Actual model result

The probe used six native snapshot requests from the retained v1/v1.1 cases. It called the production HTTP adapter through normal model admission and accounting in fresh owned fixture databases. No game credentials or action execution path was supplied to inference. Requests were capped at six calls and ten minutes; no model request was retried.

| Cases | Actual input tokens | Provider context | Result |
|---|---:|---:|---|
| Three v1 requests | 13,248–13,399 | 16,384 | Three valid waits |
| Three v1.1 requests | 15,170–15,396 | 16,384 | Rejected before inference: input plus 1,536 output tokens exceeds context |
| Same three previously undispatched v1.1 requests | 15,170–15,396 | 32,768 | Three valid waits |

Actual inference totals: **six calls; 85,669 input + 1,864 output = 87,533 tokens**. Per-call latency was **6.049–8.778 seconds**. All six outputs passed the model schema and native factual-wait validation; all usage was reported. Zero inference failures, retries, unknown usage or game commands. The initial accounting-fixture setup refused an unsupported fixture architecture before dispatch; it was corrected in a fresh owned fixture, with zero calls in that failed setup.

These were single-decision observations, not complete autonomous workflows: proposed continuity changes were not saved, and no follow-up reads or actions were executed. Valid waits do not establish good strategy or progress. The larger limits removed the tested input refusals but did **not** produce active decisions in this sample. No matched real-model 32,000-byte control was run; this is not a measured causal accuracy improvement.

## Final state

Both positively owned test providers were stopped after their requests completed. No background worker, scheduler, rules service or game API was started. Clock remains paused at tick 633; all 24 cohorts paused; window closed; zero active turns or capacity leases. Original unknown rows and all configuration pins other than the authorized input change match the baseline. No commit or push.

The 64,000-byte allowance is persisted for the 20 eligible cohorts. The 32,768-token provider was a stopped isolated test instance, not an installed live-world cutover; future activation must use matching context/cache metadata. Four held cohorts remain unchanged. No 24-hour run or strategic-readiness acceptance follows from this result.
