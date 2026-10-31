import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import { canonical, digest } from "../contracts.js";
import { gradeCase } from "../evaluation/assertions.js";
import type { DatasetCase } from "../evaluation/datasets.js";
import type { ArtifactRecord } from "../evidence/artifacts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import type { ResearchPrincipal, RunInspection } from "../evidence/inspection.js";
import {
  type CapabilityFingerprint,
  compileManifest,
  type ResolvedRunManifest,
  type RunManifestInput,
} from "../manifests/compiler.js";
import { ManifestRepository } from "../manifests/repository.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const Candidate = z
  .object({
    schemaVersion: z.literal("fleet.candidate/v1"),
    content: z
      .object({
        optimizer: z.literal("dspy-bootstrap-fewshot@1"),
        optimizerVersion: z.literal("3.4.1"),
        moduleVersion: z.literal("pact-bounded-decision@1"),
        signature: z.literal("case_id, case_text -> answer"),
        instructions: z.string().max(4000),
        seed: z.number().int(),
        datasetDigest: hash,
        splitDigests: z.object({ train: hash, development: hash, heldout: hash }).strict(),
        demonstrations: z
          .array(
            z.object({ case_id: z.string(), case_text: z.string().max(20000), answer: z.string().max(20000) }).strict(),
          )
          .min(1)
          .max(2),
      })
      .strict(),
    digest: hash,
    lineage: z
      .object({
        calls: z.number().int().min(1).max(16),
        allocationIds: z.array(z.uuid()).min(1).max(16),
        resultRefs: z.array(z.uuid()).min(1).max(16),
      })
      .strict(),
    artifactDigest: hash,
  })
  .strict();
export type CandidateArtifact = z.infer<typeof Candidate>;
type Stored = { candidate: CandidateArtifact; manifest: ResolvedRunManifest };
/** Native review registry. No activation method and no actor-supplied grading API. */
export class CandidateRegistry {
  readonly store;
  constructor(
    readonly inspection: RunInspection,
    readonly capture: CaptureSession,
    readonly principal: ResearchPrincipal,
    readonly base: RunManifestInput,
    readonly capability: CapabilityFingerprint,
    readonly training: {
      manifest: { splitDigests: { train: string; development: string; heldout: string } };
      train: DatasetCase[];
    },
  ) {
    this.store = inspection.store;
  }
  private fail(code: string): never {
    throw new FleetError(code, true);
  }
  private cipher(value: unknown, id: string) {
    if (Buffer.byteLength(canonical(value)) > 1048576) this.fail("CANDIDATE_QUOTA");
    return this.store.vault.encrypt(value, `candidate:${id}`);
  }
  private async source(id: string) {
    const a = (await this.store.pool.query("SELECT * FROM research_artifacts WHERE id=$1", [id])).rows[0];
    if (!a) this.fail("CANDIDATE_UNAVAILABLE");
    await this.inspection.authorize(a.run_id, this.principal);
    const ref = {
      id: a.id,
      contentType: a.content_type,
      bytes: String(a.bytes),
      chunks: String(a.chunks.length),
      ciphertextDigest: a.ciphertext_digest,
      privacyClass: a.privacy_class,
      retentionClass: a.retention_class,
    };
    const chunks = [];
    let size = 0;
    for await (const chunk of this.capture.artifacts.read(a.scope, ref)) {
      size += chunk.length;
      if (size > 1048576) this.fail("CANDIDATE_QUOTA");
      chunks.push(Buffer.from(chunk));
    }
    await this.inspection.authorize(a.run_id, this.principal);
    return { record: a, body: JSON.parse(Buffer.concat(chunks).toString()) };
  }
  private async call(allocationId: string, resultRef: string) {
    const row = (
      await this.store.pool.query(
        "SELECT c.*,g.dataset_digest,o.scope,s.result,l.status ledger_status,l.input_tokens,l.output_tokens,m.manifest FROM research_evaluation_calls c JOIN research_evaluation_grants g ON g.id=c.grant_id JOIN research_operations o ON o.operation_id=g.operation_id JOIN research_steps s ON s.operation_id=g.operation_id AND s.logical_step_id=c.logical_step_id JOIN compute_ledger l ON l.id=c.allocation_id JOIN research_manifests m ON m.digest=o.manifest_digest WHERE c.allocation_id=$1",
        [allocationId],
      )
    ).rows[0];
    if (
      !row ||
      row.status !== "completed" ||
      row.result.resultRef?.id !== resultRef ||
      row.ledger_status !== "reported"
    )
      this.fail("CANDIDATE_LINEAGE_INVALID");
    const source = await this.source(resultRef);
    if (source.record.run_id !== row.scope.runId) this.fail("CANDIDATE_LINEAGE_INVALID");
    return { ...row, source };
  }
  async propose(raw: unknown) {
    const c = Candidate.parse(raw),
      { artifactDigest, ...body } = c;
    if (digest(c.content) !== c.digest || digest(body) !== artifactDigest) this.fail("CANDIDATE_INTEGRITY");
    if (
      c.lineage.calls !== c.lineage.allocationIds.length ||
      c.lineage.calls !== c.lineage.resultRefs.length ||
      new Set(c.lineage.allocationIds).size !== c.lineage.calls
    )
      this.fail("CANDIDATE_LINEAGE_INVALID");
    if (
      digest(this.training.manifest) !== c.content.datasetDigest ||
      canonical(this.training.manifest.splitDigests) !== canonical(c.content.splitDigests) ||
      digest(this.training.train) !== c.content.splitDigests.train
    )
      this.fail("CANDIDATE_DATASET_MISMATCH");
    for (const demo of c.content.demonstrations) {
      const example = this.training.train.find((x) => x.id === demo.case_id);
      if (
        !example ||
        example.actorInput !== demo.case_text ||
        canonical(example.recordedOutput) !== canonical(JSON.parse(demo.answer))
      )
        this.fail("CANDIDATE_TRAINING_ONLY");
    }
    const sources: ArtifactRecord[] = [];
    const teacherCases = new Set<string>();
    for (let i = 0; i < c.lineage.calls; i++) {
      const row = await this.call(c.lineage.allocationIds[i], c.lineage.resultRefs[i]);
      if (
        row.phase !== "teacher" ||
        row.dataset_digest !== c.content.datasetDigest ||
        row.manifest.evaluation.split !== "train-development"
      )
        this.fail("CANDIDATE_LINEAGE_INVALID");
      teacherCases.add(row.case_id);
      sources.push(row.source.record);
    }
    if (c.content.demonstrations.some((d) => !teacherCases.has(d.case_id))) this.fail("CANDIDATE_LINEAGE_INVALID");
    if (Buffer.byteLength(candidatePrompt(c)) > this.base.context.maxBytes) this.fail("CANDIDATE_CONTEXT_CAP");
    const compiled = compileManifest(
      {
        ...this.base,
        build: { ...this.base.build, build: c.digest },
        evaluation: { ...this.base.evaluation, dataset: c.content.datasetDigest, split: "development" },
      },
      this.capability,
    );
    await new ManifestRepository(this.store.pool).save(compiled.manifest);
    const id = randomUUID(),
      expiresAt = new Date(Math.min(...sources.map((s) => new Date(s.expires_at).getTime())));
    return transaction(this.store.pool, async (db) => {
      for (const a of sources) {
        const locked = (
          await db.query("SELECT status,purged,expires_at FROM research_artifacts WHERE id=$1 FOR SHARE", [a.id])
        ).rows[0];
        await this.capture.artifacts.authorize(a.scope, a.consent_version, db);
        if (!locked || locked.status !== "complete" || locked.purged || new Date(locked.expires_at) <= this.store.now())
          this.fail("CANDIDATE_UNAVAILABLE");
      }
      const old = (
        await db.query("SELECT id,body_cipher,expires_at FROM research_candidates WHERE digest=$1", [c.artifactDigest])
      ).rows[0];
      if (old) {
        if (!old.body_cipher || new Date(old.expires_at) <= this.store.now()) this.fail("CANDIDATE_UNAVAILABLE");
        return old.id as string;
      }
      await db.query("INSERT INTO research_candidates VALUES($1,$2,$3,$4,$5)", [
        id,
        c.artifactDigest,
        this.cipher({ candidate: c, manifest: compiled.manifest }, id),
        this.store.now(),
        expiresAt,
      ]);
      for (const a of sources)
        await db.query("INSERT INTO research_candidate_sources VALUES($1,$2) ON CONFLICT DO NOTHING", [id, a.id]);
      return id;
    });
  }
  async get(id: string): Promise<Stored> {
    const row = (await this.store.pool.query("SELECT * FROM research_candidates WHERE id=$1", [id])).rows[0];
    if (!row?.body_cipher || new Date(row.expires_at) <= this.store.now()) this.fail("CANDIDATE_UNAVAILABLE");
    const sources = (
      await this.store.pool.query("SELECT artifact_id FROM research_candidate_sources WHERE candidate_id=$1", [id])
    ).rows;
    if (!sources.length) this.fail("CANDIDATE_UNAVAILABLE");
    for (const source of sources) await this.source(source.artifact_id);
    return this.store.vault.decrypt<Stored>(row.body_cipher, `candidate:${id}`);
  }
  async beginHeldout(id: string, datasetDigest: string) {
    const stored = await this.get(id);
    if (stored.candidate.content.splitDigests.heldout !== datasetDigest) this.fail("HELDOUT_DIGEST_MISMATCH");
    const prior = (
      await this.store.pool.query(
        "SELECT 1 FROM research_evaluation_calls c JOIN research_evaluation_grants g ON g.id=c.grant_id JOIN research_operations o ON o.operation_id=g.operation_id JOIN research_manifests m ON m.digest=o.manifest_digest WHERE g.dataset_digest=$1 AND m.manifest->'evaluation'->>'split'='heldout' LIMIT 1",
        [stored.candidate.content.datasetDigest],
      )
    ).rowCount;
    if (prior) this.fail("HELDOUT_ALREADY_CONSUMED");
    const result = await this.store.pool.query(
      "INSERT INTO research_holdout_claims VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [datasetDigest, id, this.store.now()],
    );
    if (!result.rowCount) this.fail("HELDOUT_ALREADY_CONSUMED");
  }
  /** Independent host grades actual native outputs against the frozen heldout rubric. */
  async recordHeldout(
    id: string,
    dataset: { manifest: { splitDigests: { heldout: string } }; heldout?: DatasetCase[] },
    results: { candidateId: string; caseId: string; allocationId: string; resultRef: string }[],
  ) {
    const stored = await this.get(id),
      cases = dataset.heldout ?? [];
    if (
      !cases.length ||
      digest(cases) !== dataset.manifest.splitDigests.heldout ||
      stored.candidate.content.splitDigests.heldout !== digest(cases)
    )
      this.fail("HELDOUT_DIGEST_MISMATCH");
    const claim = (
      await this.store.pool.query("SELECT * FROM research_holdout_claims WHERE dataset_digest=$1", [digest(cases)])
    ).rows[0];
    if (claim?.candidate_id !== id) this.fail("HELDOUT_CLAIM_REQUIRED");
    if (
      (await this.store.pool.query("SELECT 1 FROM research_candidate_assessments WHERE candidate_id=$1", [id])).rowCount
    )
      this.fail("HELDOUT_ALREADY_CONSUMED");
    if (results.length !== 2 * cases.length || new Set(results.map((r) => r.allocationId)).size !== results.length)
      this.fail("HELDOUT_POPULATION_INVALID");
    const grades = [];
    const sources: ArtifactRecord[] = [];
    for (const candidateId of ["reference", id])
      for (const c of cases) {
        const matches = results.filter((r) => r.candidateId === candidateId && r.caseId === c.id);
        if (matches.length !== 1) this.fail("HELDOUT_POPULATION_INVALID");
        const r = matches[0],
          native = await this.call(r.allocationId, r.resultRef);
        if (
          native.candidate_id !== candidateId ||
          native.case_id !== c.id ||
          native.phase !== "candidate" ||
          native.manifest.evaluation.split !== "heldout" ||
          native.dataset_digest !== stored.candidate.content.datasetDigest
        )
          this.fail("HELDOUT_LINEAGE_INVALID");
        if (native.input_tokens === null || native.output_tokens === null) this.fail("HELDOUT_USAGE_UNKNOWN");
        grades.push({ candidateId, caseId: c.id, ...gradeCase(JSON.stringify(native.source.body.decision), c.rubric) });
        sources.push(native.source.record);
      }
    const resources = (
      await this.store.pool.query(
        "SELECT c.allocation_id,c.status,l.input_tokens::text,l.output_tokens::text,s.result,m.manifest FROM research_evaluation_calls c JOIN research_evaluation_grants g ON g.id=c.grant_id JOIN research_operations o ON o.operation_id=g.operation_id JOIN research_steps s ON s.operation_id=g.operation_id AND s.logical_step_id=c.logical_step_id JOIN research_manifests m ON m.digest=o.manifest_digest LEFT JOIN compute_ledger l ON l.id=c.allocation_id WHERE c.candidate_id=$1 OR c.allocation_id=ANY($2::uuid[])",
        [id, [...stored.candidate.lineage.allocationIds, ...results.map((r) => r.allocationId)]],
      )
    ).rows;
    const tuning = resources.filter((r) => r.manifest.evaluation.split !== "heldout");
    if (
      tuning.length > 16 ||
      resources.some((r) => r.status !== "completed" || r.input_tokens === null || r.output_tokens === null)
    )
      this.fail("CANDIDATE_RESOURCE_GATE");
    const knownTokens = resources.reduce((n, r) => n + BigInt(r.input_tokens) + BigInt(r.output_tokens), 0n);
    if (knownTokens > 1000000n) this.fail("CANDIDATE_RESOURCE_GATE");
    for (const r of resources) {
      const source = await this.source(r.result.resultRef.id);
      if (!sources.some((a) => a.id === source.record.id)) sources.push(source.record);
    }
    const baseline = grades.filter((g) => g.candidateId === "reference" && g.pass).length / cases.length,
      candidate = grades.filter((g) => g.candidateId === id && g.pass).length / cases.length;
    const assessment = {
      version: "fleet.promotion-assessment/v1",
      candidateId: id,
      datasetDigest: digest(cases),
      baseline,
      candidate,
      delta: candidate - baseline,
      promoted: false,
      conclusion: candidate > baseline ? "REQUIRES_INDEPENDENT_REVIEW" : "NO_DEMONSTRATED_IMPROVEMENT",
      gates: { integrity: true, usageKnown: true, context: true, resources: true },
      resourceDetails: {
        tuningCalls: tuning.length,
        heldoutCalls: resources.length - tuning.length,
        knownTokens: String(knownTokens),
        tokenCap: "1000000",
      },
      independentUnits: 1,
      flags: ["INSUFFICIENT_INDEPENDENT_UNITS"],
      grades,
    };
    const resultId = randomUUID();
    await transaction(this.store.pool, async (db) => {
      const current = (
        await db.query("SELECT body_cipher,expires_at FROM research_candidates WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!current?.body_cipher || new Date(current.expires_at) <= this.store.now()) this.fail("CANDIDATE_UNAVAILABLE");
      if ((await db.query("SELECT 1 FROM research_candidate_assessments WHERE candidate_id=$1", [id])).rowCount)
        this.fail("HELDOUT_ALREADY_CONSUMED");
      for (const a of sources) {
        const locked = (
          await db.query("SELECT status,purged,expires_at FROM research_artifacts WHERE id=$1 FOR SHARE", [a.id])
        ).rows[0];
        if (!locked || locked.status !== "complete" || locked.purged || new Date(locked.expires_at) <= this.store.now())
          this.fail("CANDIDATE_UNAVAILABLE");
        await this.capture.artifacts.authorize(a.scope, a.consent_version, db);
        await db.query("INSERT INTO research_candidate_sources VALUES($1,$2) ON CONFLICT DO NOTHING", [id, a.id]);
      }
      const expiry = new Date(Math.min(...sources.map((a) => new Date(a.expires_at).getTime())));
      await db.query("UPDATE research_candidates SET expires_at=LEAST(expires_at,$2) WHERE id=$1", [id, expiry]);
      await db.query("INSERT INTO research_candidate_assessments VALUES($1,$2,$3,$4,$5)", [
        resultId,
        id,
        digest(assessment),
        this.cipher(assessment, resultId),
        expiry,
      ]);
    });
    return resultId;
  }
  async assess(id: string, resultId: string) {
    await this.get(id);
    const row = (
      await this.store.pool.query("SELECT * FROM research_candidate_assessments WHERE id=$1 AND candidate_id=$2", [
        resultId,
        id,
      ])
    ).rows[0];
    if (!row?.body_cipher || new Date(row.expires_at) <= this.store.now()) this.fail("HELDOUT_RESULT_UNAVAILABLE");
    return this.store.vault.decrypt<Record<string, unknown>>(row.body_cipher, `candidate:${resultId}`);
  }
}
export function candidatePrompt(candidate: CandidateArtifact) {
  return `${candidate.content.instructions}\nDemonstrations:\n${canonical(candidate.content.demonstrations)}\nCurrent authorized actor input:\n{{actorInput}}`;
}
