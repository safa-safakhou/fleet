import { expect, it } from "vitest";
import { FleetMetrics, recordCallRequest, recordCallResponse } from "../../src/call-metrics.js";
import { Communications } from "../../src/games/pact/communications.js";
import { fixture, ready } from "../helpers.js";

it("ingests scoped communication reads once and honors observation consent", async () => {
  const f = await fixture();
  try {
    const cohort = await ready(f.store, 1),
      claim = (await f.store.claim("communications"))!;
    const journal = new Communications(f.store),
      peer = "synthetic-peer";
    const page = {
      messages: [
        { id: "sent-one", senderKingdomId: claim.agent.kingdom_id, sentGameTimeMs: "100", body: "PRIVATE_ONE" },
        { id: "received-one", senderKingdomId: peer, sentGameTimeMs: "101", body: "PRIVATE_TWO" },
      ],
    };
    await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [cohort]);
    await journal.observeRead(claim.agentId, "pact_council_thread_v1", { kingdomId: peer }, page);
    await journal.observeRead(claim.agentId, "pact_council_thread_v1", { kingdomId: peer }, page);
    const metrics = await new FleetMetrics(f.store).read({ minutes: 60, cohortId: cohort });
    expect(metrics.research.reciprocalCommunication).toMatchObject({ messages: 2, reciprocal_pairs: 1 });
    expect(JSON.stringify(metrics)).not.toContain("PRIVATE_");
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [cohort]);
    await journal.observeRead(
      claim.agentId,
      "pact_council_thread_v1",
      { kingdomId: peer },
      { messages: [{ ...page.messages[0], id: "unconsented" }] },
    );
    expect((await f.pool.query("SELECT count(*)::int n FROM communications")).rows[0].n).toBe(2);
  } finally {
    await f.pool.end();
  }
});

it("compares queue and execution time across both runtime paths without inventing missing completion metadata", async () => {
  const f = await fixture();
  try {
    const cohort = await ready(f.store, 1),
      claim = (await f.store.claim("timing"))!;
    const result = { decision: null, inputTokens: 10, outputTokens: 5 };
    const ids: string[] = [];
    for (const scope of ["queue_and_provider", "provider"] as const) {
      const id = await f.store.reserveCall(claim);
      ids.push(id);
      await recordCallRequest(
        f.store,
        id,
        {
          model: claim.cohort.model!,
          messages: [],
          schema: {},
          maxOutputTokens: 100,
          signal: new AbortController().signal,
        },
        64000,
        {},
        { queueDelayMs: 12 },
      );
      await f.store.recordUsage(id, 10, 5);
      await recordCallResponse(f.store, id, result, scope === "provider" ? 18 : 30, scope);
    }
    const metrics = await new FleetMetrics(f.store).read({ minutes: 60, cohortId: cohort });
    for (const id of ids)
      expect(metrics.calls.find((c) => c.id === id)).toMatchObject({
        queueDelayMs: 12,
        providerExecutionMs: 18,
        endToEndMs: 30,
        finishReason: null,
        reasoningChars: null,
      });
    expect(metrics.research).toMatchObject({
      responseMetadataCalls: 2,
      finishReasonCalls: 0,
      reasoningMetadataCalls: 0,
      comparableTimingCalls: 2,
      truncatedCalls: 0,
    });
  } finally {
    await f.pool.end();
  }
});

it("records safe call metadata and aggregates exact calls/actions with unknown context kept unknown", async () => {
  const f = await fixture();
  try {
    const id = await ready(f.store, 1),
      claim = (await f.store.claim("metrics"))!;
    const allocation = await f.store.reserveCall(claim);
    const request = {
      model: claim.cohort.model!,
      messages: [{ role: "user", content: "PRIVATE_SENTINEL" }],
      schema: { type: "object" },
      maxOutputTokens: 8192,
      signal: AbortSignal.timeout(1000),
    };
    await recordCallRequest(f.store, allocation, request, 64000, { contextWindow: () => 32768 });
    await f.store.recordUsage(allocation, 8192, 4096);
    await recordCallResponse(
      f.store,
      allocation,
      {
        decision: { private: "PRIVATE_SENTINEL" },
        inputTokens: 8192,
        outputTokens: 4096,
        execution: {
          requestId: "synthetic",
          firstContentMs: 1,
          elapsedMs: 20,
          contentChars: 4,
          chunks: 1,
          maxWhitespaceRun: 0,
          finishReason: "PRIVATE_SENTINEL",
          reasoningChars: 40,
        },
      },
      20,
    );
    const second = await f.store.reserveCall(claim);
    await f.store.recordUsage(second, 100, 50);
    const data = await new FleetMetrics(f.store).read({ minutes: 60, cohortId: id });
    expect(data.totals.calls).toBe(2);
    expect(data.totals.inputTokens).toBe(8292);
    expect(data.totals.actions).toBe(0);
    expect(data.calls.find((x) => x.id === allocation)).toMatchObject({
      contextPercent: 25,
      outputPercent: 50,
      reasoningChars: 40,
      finalTextChars: 4,
      firstContentMs: 1,
      schemaBytes: Buffer.byteLength(JSON.stringify(request.schema)),
      messageBytes: Buffer.byteLength(JSON.stringify(request.messages)),
    });
    expect(data.calls.find((x) => x.id === second)?.contextPercent).toBeNull();
    expect(data.calls.find((x) => x.id === second)?.finalTextChars).toBeNull();
    expect(data.research.taskAttempts).toBe(0);
    expect(data.research.legacyAttempts).toBe(1);
    expect(data.research.responseMetadataCalls).toBe(1);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_SENTINEL");
    expect(
      (await f.pool.query("SELECT request_metrics,response_metrics FROM compute_ledger WHERE id=$1", [allocation]))
        .rows[0],
    ).toMatchObject({
      request_metrics: { contextWindowTokens: 32768, maxOutputTokens: 8192 },
      response_metrics: { elapsedMs: 20, finishReason: "other" },
    });
    await f.pool.query(
      "UPDATE turns SET started_at=$2,finished_at=$3,state='finished',code='WAIT',actions=2 WHERE id=$1",
      [claim.id, new Date(f.store.now().getTime() - 65 * 60000), f.store.now()],
    );
    const completed = await new FleetMetrics(f.store).read({ minutes: 60, cohortId: id });
    expect(completed.totals.actions).toBe(2);
    expect(completed.series.reduce((sum, p) => sum + p.actions, 0)).toBe(2);
    expect(completed.architectures.reduce((sum, a) => sum + a.actions, 0)).toBe(2);
    await f.pool.query("UPDATE cohorts SET observation_consent=true WHERE id=$1", [id]);
    const agent = (await f.pool.query("SELECT id,kingdom_id FROM agents WHERE cohort_id=$1 LIMIT 1", [id])).rows[0];
    for (const [source, direction] of [
      ["one", "outgoing"],
      ["two", "outgoing"],
      ["three", "incoming"],
    ])
      await f.pool.query(
        "INSERT INTO communications(id,cohort_id,owner_agent_id,peer_kingdom_id,source_id,kind,direction,occurred_at,body_cipher) VALUES(gen_random_uuid(),$1,$2,'synthetic-peer',$3,'message',$4,$5,'PRIVATE_CIPHER')",
        [id, agent.id, source, direction, f.store.now()],
      );
    const social = await new FleetMetrics(f.store).read({ minutes: 60, cohortId: id });
    expect(social.research.reciprocalCommunication).toMatchObject({
      messages: 3,
      pairs: 1,
      reciprocal_pairs: 1,
      participants: 2,
    });
    expect(JSON.stringify(social)).not.toContain("PRIVATE_CIPHER");
    await f.pool.query("UPDATE cohorts SET observation_consent=false WHERE id=$1", [id]);
    expect(
      (await new FleetMetrics(f.store).read({ minutes: 60, cohortId: id })).research.reciprocalCommunication.messages,
    ).toBe(0);
    await expect(new FleetMetrics(f.store).read({ minutes: 0 })).rejects.toThrow();
  } finally {
    await f.pool.end();
  }
});
