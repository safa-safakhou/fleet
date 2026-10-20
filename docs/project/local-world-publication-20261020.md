# Local-world source and report publication — 20 October 2026

The founder requested committing the local-world work, reports and result documents and pushing both repositories to master. Fleet integrates `codex/local-world-preparation` at `f19d05e5b6f6bf80f4c0678c03e2b30f714bc34e` with master at `f100da622ef0eec766807d833c5674e356ed80cb`. Both histories and the independent specialist architecture plans are preserved. The merge required no source conflict resolution.

## Reports included

| Evidence | Record |
|---|---|
| Latest actual requests, responses, receipts and remaining reasoning gaps | [Four-profile reasoning outcomes](../reasoning-outcomes-20261020.md) |
| Fresh-world reset and thirty-minute observation | [Fresh half hour](../local-fresh-half-hour-20261020.md) |
| Earlier thirty-minute observation | [Original half hour](../local-half-hour-20261020.md) |
| Repaired one-hour observation | [Repaired hour](../repaired-hour-observation-20261019.md) |
| Initial one-hour observation and integration failures | [Initial world observation](../local-world-observation-20261019.md) |
| Prompt repairs and exact approved recovery | [Prompt and goal verification](../prompt-goal-verification-20261020.md) |

Intermediate repair reports and their implementation plans are retained. The latest live acceptance remains **partial**: four native turns used nine reported allocations and committed four commands, but the legacy profiles still made inaccurate peer/effect claims. No trade activated or delivered in that pass. The later peer-consent brief and normal-READ classifier fixes were verified offline only.

## Verification of the integrated source

Node 24.21.0 was used with fresh synthetic PostgreSQL fixtures. The Linux source archive came from the merged working tree, rather than the verification image's older source.

| Check | Result |
|---|---|
| `npm run check` | Pass; existing 26 warnings and 15 informational notices, zero errors |
| `npm run check:boundaries` | Pass |
| `npm test` on Linux | 328/328 |
| `npm run test:integration` on Linux | 414/414 |
| `npm run test:acceptance` against the integrated PACT packages | 14/14 |
| `npm run build` | Pass |
| `npm audit --omit=dev` | Zero vulnerabilities |

The first paired invocation used an unsupported fixture port and was rejected by the isolation guard before executing the PACT tests. The final 14-test run used the required isolated fixture. PACT's complete integration checks and the one smoke-test inventory correction are recorded in the [paired publication report](https://github.com/safa-safakhou/pact/blob/master/docs/implementation/reports/master-publication-20261020.md). Verification logs are retained outside Git; private world state, model packets, credentials and backup keys are excluded.

## Runtime boundary

Publication performs no new gameplay or inference. The latest accepted local-world checkpoint remains 40 turns/64 allocations, including the original reviewed unknown allocation of 40,000 tokens. The clock and four matched groups remain parked under their closed gates. The live worktrees are retained; this integration does not replace their installed Fleet `2d4d85b` / PACT `bb17142` artifacts. Historical populations, identities, settings and evidence retain their prior scope.
