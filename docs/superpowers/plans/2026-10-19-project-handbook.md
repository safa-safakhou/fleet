# PACT and Fleet project handbook and publication plan

> **For agentic workers:** Use superpowers:executing-plans and verification-before-completion. Founder requires no delegation. Publish to master only within the selected documentation/implementation scope; never deploy or enable execution.

**Goal:** Make the project's technical design, development journey, evidence and limits understandable and shareable.
**Architecture:** A linked Markdown handbook in Fleet owns the combined narrative, runtime architecture, qualification findings and presentation guide. PACT owns a complementary game-side technical guide and local evidence index. Relative in-repository links and explicit GitHub cross-repository links work for readers without sibling checkouts. Original reports retain their dates and results.
**Tech Stack:** Repository-native Markdown/Mermaid and JSON; existing documentation/backlog/type/style checks; no new runtime dependencies.
**Spec:** Founder request19October2026 to document all findings/full technical and design/report journey, commit and push master. Existing19October assessment and dated evidence are the factual sources.

## Global constraints

No model/helper inference, game/server access, installation, execution flag/account/budget/authority/threshold/schedule change, unknown review/replay, shadow/population, reset or delegation. No private traces, keys, raw personal messages, environment files or runtime state in Git. Publication changes repository contents only. No force push or discarding work. Preserve all existing worktrees and historical evidence.

## Review focus

- Outdated phase reports: distinguish historical scope, source verification, synthetic provider qualification, installed versions and live acceptance.
- Causal claims: keep observations, reproduced mechanisms and hypotheses separate; do not rank architectures from confounded small samples.
- Public navigation: cross-repository links must work on GitHub without sibling directories.
- Source publication: inspect complete outgoing range and CI/deployment hooks; preserve master divergence and verify exact remote heads.
- Scope: publishing existing implementation branches requires the founder's selected scope; draft documentation independently while awaiting that answer.

### Task1: Evidence map and handbook

**Files:** Fleet docs/project/{README,architecture,design-decisions,journey,findings,operations,current-state,talking-points,references}.md; README.md.
- [ ] Read dated architecture/design/completion/diagnostic reports and build an explicit evidence index.
- [ ] Write a reader guide, diagrams and technology/module map; decision history with alternatives and limits; dated journey and cumulative usage reconciliation; findings and gaps; operations/evaluation guide; speaking notes and glossary.
- [ ] Keep documented actual source/model/installation states consistent with pinned evidence; clearly label future100-Luna/mixed-world plans.

### Task2: PACT guide and document verification

**Files:** PACT docs/project/{README,architecture,journey}.md; README.md; docs/implementation/README.md; covering AGENTS.md notes in both repositories.
- [ ] Explain game goals/domain modules, transaction/permission/receipt boundaries, P1/P2/P3, neutral survival/relationships design and remaining deployment/coordination gates.
- [ ] Link both handbooks and original reports with GitHub-safe paths; add an evidence-based19October entry above historical notices.
- [ ] Verify every new local link/source path and Markdown structure, diagrams and numbers; run applicable checks/backlog consistency and scan outgoing content for sensitive files/credentials.

### Task3: Commit and publish master

**Interfaces:** selected publication scope from founder; original remotes and clean checkouts.
- [ ] Fetch both remotes and inspect divergence/workflows. Assemble the selected master contents without force, deployment or worktree deletion.
- [ ] Run verification appropriate to the final tree. If implementation is included, run its full local unit/integration/paired/application gates with only owned fixtures.
- [ ] Commit reviewed documentation, merge within authorized scope, push master normally and verify remote commit IDs; report actual hosted CI status separately.
- [ ] Retain private verification evidence; report links, revisions and material limitations.
