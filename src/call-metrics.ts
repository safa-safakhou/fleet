import { z } from "zod";
import { FleetError, type ModelPort, object } from "./domain.js";
import type { Store } from "./store.js";

type Request = Parameters<ModelPort["decide"]>[0];
const count = (n: unknown) => (Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : null);
/** Counts and byte sizes only. Never persist prompts, peer text or schema contents. */
export function callPacketMetrics(request: Pick<Request, "messages" | "schema">) {
  const packets = request.messages.flatMap((m) => {
    try {
      return [object(JSON.parse(m.content))];
    } catch {
      return [];
    }
  });
  const inbox = packets.map((p) => object(p.inbox)).find((p) => Array.isArray(p.records));
  const coverage = packets.map((p) => object(p.coverage));
  return {
    messageBytes: Buffer.byteLength(JSON.stringify(request.messages)),
    schemaBytes: Buffer.byteLength(JSON.stringify(request.schema)),
    inboxDelivered: inbox ? (inbox.records as unknown[]).length : null,
    inboxOmitted: inbox ? count(inbox.omitted) : null,
    quotedOptionsOmitted: coverage.map((c) => count(c.quotedOptionsOmitted)).find((n) => n !== null) ?? null,
  };
}
type Result = Awaited<ReturnType<ModelPort["decide"]>>;
export async function recordCallRequest(
  store: Store,
  id: string,
  request: Request,
  inputLimitBytes: number,
  provider: Pick<ModelPort, "contextWindow">,
  timing?: { queueDelayMs: number },
) {
  const window = provider.contextWindow?.(request.model);
  await store.pool.query("UPDATE compute_ledger SET request_metrics=$2 WHERE id=$1", [
    id,
    {
      ...callPacketMetrics(request),
      queueDelayMs: timing ? count(Math.round(timing.queueDelayMs)) : null,
      contextWindowTokens: Number.isSafeInteger(window) && Number(window) > 0 ? window : null,
      requestBytes:
        Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
      inputLimitBytes,
      maxOutputTokens: request.maxOutputTokens,
      thinking: request.model.thinking ?? null,
    },
  ]);
}
export async function recordCallResponse(store: Store, id: string, result: Result, elapsedMs: number) {
  const code = result.decisionError;
  const finish = result.execution?.finishReason;
  await store.pool.query("UPDATE compute_ledger SET response_metrics=$2 WHERE id=$1", [
    id,
    {
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      finishReason: finish
        ? ["stop", "length", "tool_calls", "function_call", "content_filter"].includes(finish)
          ? finish
          : "other"
        : null,
      reasoningChars: result.execution?.reasoningChars ?? null,
      finalTextChars:
        typeof result.outputText === "string" ? result.outputText.length : (result.execution?.contentChars ?? null),
      firstContentMs: result.execution?.firstContentMs ?? null,
      generationMs: result.execution?.elapsedMs ?? null,
      decisionError: code && /^[A-Z0-9_]{1,80}$/.test(code) ? code : null,
    },
  ]);
}
export const MetricsQuery = z
  .object({
    minutes: z.coerce
      .number()
      .refine((n) => [15, 60, 360, 1440].includes(n))
      .default(60),
    cohortId: z.uuid().optional(),
  })
  .strict();
const num = (n: unknown) => (n === null || n === undefined ? null : Number(n));
export class FleetMetrics {
  constructor(private store: Store) {}
  async read(raw: unknown) {
    const q = MetricsQuery.parse(raw),
      now = this.store.now(),
      since = new Date(now.getTime() - q.minutes * 60000),
      step = Math.max(60, Math.ceil((q.minutes * 60) / 30));
    if (q.cohortId && !(await this.store.pool.query("SELECT 1 FROM cohorts WHERE id=$1", [q.cohortId])).rowCount)
      throw new FleetError("NOT_FOUND");
    const args = [since, now, q.cohortId ?? null];
    const [
      usage,
      turns,
      points,
      outcomes,
      calls,
      architectures,
      commands,
      taskCounts,
      diagnostics,
      availability,
      lateUsage,
      communication,
    ] = await Promise.all([
      this.store.pool.query(
        "SELECT count(*)::int calls,count(*) FILTER(WHERE status='unknown')::int unknown,count(*) FILTER(WHERE status='reserved')::int reserved,coalesce(sum(input_tokens),0)::float8 input,coalesce(sum(output_tokens),0)::float8 output FROM compute_ledger WHERE created_at>=$1 AND created_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3)",
        args,
      ),
      this.store.pool.query(
        "SELECT count(*)::int turns,(SELECT coalesce(sum(actions),0)::int FROM turns a WHERE a.finished_at>=$1 AND a.finished_at<=$2 AND ($3::uuid IS NULL OR a.cohort_id=$3)) actions,count(*) FILTER(WHERE state='finished' AND actions=0 AND code='WAIT')::int waits,count(*) FILTER(WHERE state='finished' AND actions=0)::int no_action_turns FROM turns WHERE started_at>=$1 AND started_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3)",
        args,
      ),
      this.store.pool.query(
        "SELECT floor(extract(epoch FROM created_at)/$4)::bigint bucket,'calls' metric,count(*)::int n FROM compute_ledger WHERE created_at>=$1 AND created_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3) GROUP BY 1 UNION ALL SELECT floor(extract(epoch FROM finished_at)/$4)::bigint bucket,'actions' metric,sum(actions)::int n FROM turns WHERE finished_at>=$1 AND finished_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3) GROUP BY 1 ORDER BY 1",
        [...args, step],
      ),
      this.store.pool.query(
        "SELECT coalesce(code,state) code,count(*)::int n FROM turns WHERE started_at>=$1 AND started_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3) GROUP BY 1 ORDER BY n DESC",
        args,
      ),
      this.store.pool.query(
        "SELECT l.id,l.turn_id,l.cohort_id,c.name cohort,l.created_at,l.status,l.input_tokens::float8,l.output_tokens::float8,l.request_metrics,l.response_metrics FROM compute_ledger l JOIN cohorts c ON c.id=l.cohort_id WHERE l.created_at>=$1 AND l.created_at<=$2 AND ($3::uuid IS NULL OR l.cohort_id=$3) ORDER BY l.created_at DESC,l.id DESC LIMIT 200",
        args,
      ),
      this.store.pool.query(
        "SELECT coalesce(p.profile_id||'@'||p.profile_version,'legacy') architecture,(SELECT count(*)::int FROM compute_ledger l WHERE l.cohort_id=c.id AND l.created_at>=$1 AND l.created_at<=$2) calls,(SELECT coalesce(sum(t.actions),0)::int FROM turns t WHERE t.cohort_id=c.id AND t.finished_at>=$1 AND t.finished_at<=$2) actions FROM cohorts c LEFT JOIN cohort_engine_profiles p ON p.cohort_id=c.id WHERE ($3::uuid IS NULL OR c.id=$3)",
        args,
      ),
      this.store.pool.query(
        "SELECT p.state,coalesce(p.outcome->>'code',p.state) code,count(*)::int n FROM platform_commands p JOIN turns t ON t.id=p.turn_id WHERE p.created_at>=$1 AND p.created_at<=$2 AND ($3::uuid IS NULL OR t.cohort_id=$3) GROUP BY 1,2 ORDER BY 1,2",
        args,
      ),
      this.store.pool.query(
        "SELECT count(c.turn_id)::int task_attempts,count(DISTINCT c.task_id)::int tasks,count(*) FILTER(WHERE c.turn_id IS NULL)::int legacy_attempts,count(*) FILTER(WHERE t.actions>0)::int attempts_with_effects,count(*) FILTER(WHERE t.actions=0 AND t.state='finished' AND t.code='WAIT')::int waits_without_effects FROM turns t LEFT JOIN platform_task_claims c ON c.turn_id=t.id WHERE t.started_at>=$1 AND t.started_at<=$2 AND ($3::uuid IS NULL OR t.cohort_id=$3)",
        args,
      ),
      this.store.pool.query(
        "SELECT count(*) FILTER(WHERE response_metrics ? 'elapsedMs')::int recorded,count(*) FILTER(WHERE response_metrics->>'finishReason'='length')::int truncated,count(*) FILTER(WHERE response_metrics->>'finalTextChars'='0')::int empty_final,count(*) FILTER(WHERE response_metrics->>'decisionError' IS NOT NULL)::int output_errors FROM compute_ledger WHERE created_at>=$1 AND created_at<=$2 AND ($3::uuid IS NULL OR cohort_id=$3)",
        args,
      ),
      this.store.pool.query(
        "SELECT c.state cohort_state,a.state agent_state,a.credential_state,count(*)::int agents FROM agents a JOIN cohorts c ON c.id=a.cohort_id WHERE ($1::uuid IS NULL OR c.id=$1) GROUP BY 1,2,3 ORDER BY 1,2,3",
        [q.cohortId ?? null],
      ),
      this.store.pool.query(
        "SELECT count(*)::int observations,coalesce(sum(u.input_tokens),0)::float8 input,coalesce(sum(u.output_tokens),0)::float8 output FROM usage_observations u JOIN compute_ledger l ON l.id=u.allocation_id WHERE u.observed_at>=$1 AND u.observed_at<=$2 AND ($3::uuid IS NULL OR l.cohort_id=$3)",
        args,
      ),
      this.store.pool.query(
        `WITH messages AS (
        SELECT DISTINCT m.source_id,
          CASE WHEN m.direction='outgoing' THEN a.kingdom_id::text ELSE m.peer_kingdom_id END sender,
          CASE WHEN m.direction='incoming' THEN a.kingdom_id::text ELSE m.peer_kingdom_id END recipient
        FROM communications m JOIN agents a ON a.id=m.owner_agent_id JOIN cohorts c ON c.id=m.cohort_id
        WHERE m.kind='message' AND m.direction IN('incoming','outgoing') AND a.kingdom_id IS NOT NULL
          AND c.observation_consent AND m.occurred_at>=$1 AND m.occurred_at<=$2 AND ($3::uuid IS NULL OR m.cohort_id=$3)
      ), edges AS (SELECT DISTINCT sender,recipient FROM messages WHERE sender<>recipient),
      pairs AS (SELECT least(sender,recipient) a,greatest(sender,recipient) b,count(*) directions FROM edges GROUP BY 1,2)
      SELECT (SELECT count(*)::int FROM messages) messages,(SELECT count(*)::int FROM edges) directed_edges,
        count(*)::int pairs,count(*) FILTER(WHERE directions=2)::int reciprocal_pairs,
        (SELECT count(*)::int FROM (SELECT sender FROM edges UNION SELECT recipient FROM edges) participants) participants
      FROM pairs`,
        args,
      ),
    ]);
    const series = Array.from(
      { length: Math.floor(now.getTime() / 1000 / step) - Math.floor(since.getTime() / 1000 / step) + 1 },
      (_, i) => ({
        at: new Date((Math.floor(since.getTime() / 1000 / step) + i) * step * 1000).toISOString(),
        calls: 0,
        actions: 0,
      }),
    );
    for (const row of points.rows) {
      const p = series.find((x) => Date.parse(x.at) === Number(row.bucket) * step * 1000);
      if (p) {
        if (row.metric === "calls") p.calls = Number(row.n);
        else p.actions = Number(row.n);
      }
    }
    const groups = new Map<string, { architecture: string; calls: number; actions: number }>();
    for (const r of architectures.rows) {
      const a = groups.get(r.architecture) ?? { architecture: r.architecture, calls: 0, actions: 0 };
      a.calls += r.calls;
      a.actions += r.actions;
      groups.set(r.architecture, a);
    }
    return {
      asOf: now.toISOString(),
      since: since.toISOString(),
      minutes: q.minutes,
      cohortId: q.cohortId ?? null,
      totals: {
        calls: usage.rows[0].calls,
        unknownCalls: usage.rows[0].unknown,
        reservedCalls: usage.rows[0].reserved,
        inputTokens: usage.rows[0].input,
        outputTokens: usage.rows[0].output,
        ...turns.rows[0],
      },
      research: {
        taskAttempts: taskCounts.rows[0].task_attempts,
        distinctTasksAttempted: taskCounts.rows[0].tasks,
        repeatedTaskAttempts: taskCounts.rows[0].task_attempts - taskCounts.rows[0].tasks,
        legacyAttempts: taskCounts.rows[0].legacy_attempts,
        attemptsWithEffects: taskCounts.rows[0].attempts_with_effects,
        waitsWithoutEffects: taskCounts.rows[0].waits_without_effects,
        responseMetadataCalls: diagnostics.rows[0].recorded,
        truncatedCalls: diagnostics.rows[0].truncated,
        emptyFinalCalls: diagnostics.rows[0].empty_final,
        outputErrorCalls: diagnostics.rows[0].output_errors,
        lateUsage: lateUsage.rows[0],
        availability: availability.rows,
        strategicQuality: null,
        reciprocalCommunication: communication.rows[0],
        coverage:
          "Attempt counts use turn start time; legacy turns have no durable task ID. Availability is current, not time-integrated exposure. Completion counts require recorded response metadata. Late usage is evidence, not settled accounting. Communication counts cover consented messages actually ingested during this window, deduplicated by native message ID and direction; observation time is not send time. Reciprocal edges show both directions, not meaningful replies or cooperation. Unobserved messages and strategic quality remain unknown.",
      },
      series,
      outcomes: outcomes.rows,
      commandOutcomes: commands.rows,
      architectures: [...groups.values()],
      calls: calls.rows.map((r) => {
        const a = object(r.request_metrics),
          b = object(r.response_metrics),
          window = num(a.contextWindowTokens),
          input = num(r.input_tokens),
          output = num(r.output_tokens),
          limit = num(a.maxOutputTokens);
        return {
          id: r.id,
          turnId: r.turn_id,
          cohortId: r.cohort_id,
          cohort: r.cohort,
          at: r.created_at.toISOString(),
          status: r.status,
          inputTokens: input,
          outputTokens: output,
          contextWindowTokens: window,
          maxOutputTokens: limit,
          contextPercent: r.status === "reported" && window && input !== null ? (100 * input) / window : null,
          outputPercent: r.status === "reported" && limit && output !== null ? (100 * output) / limit : null,
          requestBytes: num(a.requestBytes),
          messageBytes: num(a.messageBytes),
          schemaBytes: num(a.schemaBytes),
          inputBytePercent:
            num(a.requestBytes) !== null && num(a.inputLimitBytes)
              ? (100 * Number(a.requestBytes)) / Number(a.inputLimitBytes)
              : null,
          inboxDelivered: num(a.inboxDelivered),
          inboxOmitted: num(a.inboxOmitted),
          quotedOptionsOmitted: num(a.quotedOptionsOmitted),
          queueDelayMs: num(a.queueDelayMs),
          firstContentMs: num(b.firstContentMs),
          generationMs: num(b.generationMs),
          finalTextChars: num(b.finalTextChars),
          inputLimitBytes: num(a.inputLimitBytes),
          thinking: typeof a.thinking === "boolean" ? a.thinking : null,
          elapsedMs: num(b.elapsedMs),
          reasoningChars: num(b.reasoningChars),
          finishReason: typeof b.finishReason === "string" ? b.finishReason : null,
          error: typeof b.decisionError === "string" ? b.decisionError : null,
        };
      }),
      coverage: {
        callLimit: 200,
        scope:
          "Totals cover the selected time window; individual charts show the latest 200 calls. Context uses reported prompt tokens / recorded provider context. Missing historical metadata stays unknown. Output includes provider-reported thinking and final-answer tokens. Actions are confirmed game effects, not narration.",
      },
    };
  }
}
