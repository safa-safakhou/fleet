import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { digest } from "../src/research/contracts.js";
import type { EvidenceEvent } from "../src/research/evidence/types.js";
import { eventContext, parseTraceparent, traceLink } from "../src/research/telemetry/projection.js";
import { createTelemetry } from "../src/research/telemetry/sdk.js";

const exec = promisify(execFile),
  nonce = randomUUID(),
  label = "fleet.observation.fixture",
  prefix = `fleet-observe-${nonce}`,
  directory = await mkdtemp(join(tmpdir(), "fleet-observe-"));
const images = JSON.parse(await readFile(resolve("docs/research/dependencies.images.json"), "utf8")) as {
  image: string;
  digest: string;
}[];
const image = (prefix: string) => {
  const value = images.find((i) => i.image.startsWith(prefix));
  if (!value) throw Error("PIN_REQUIRED");
  return `${value.image}@${value.digest}`;
};
const containers: string[] = [],
  volumes: string[] = [];
let bridge: ReturnType<typeof createServer> | undefined;
let phase = "start",
  network = false,
  telemetry: ReturnType<typeof createTelemetry> | undefined;
const docker = async (args: string[]) => {
  const { stdout } = await exec("docker", args, { maxBuffer: 2 * 1024 * 1024 });
  return stdout.trim();
};
const owner = async (kind: string, id: string) =>
  docker([kind, "inspect", "--format", `{{ index .Labels "${label}" }}`, id]);
async function removeOwnedResource(kind: "volume" | "network", id: string) {
  if ((await owner(kind, id)) !== nonce) throw Error("OWNED_RESOURCE_REQUIRED");
  await docker([kind, "rm", id]);
}
const ownedContainer = async (id: string) => {
  if ((await docker(["inspect", "--format", `{{ index .Config.Labels "${label}" }}`, id])) !== nonce)
    throw Error("OWNED_BACKEND_REQUIRED");
};
async function poll<T>(work: () => Promise<T>, accept: (value: T) => boolean, timeout = 60000) {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeout) {
    try {
      const value = await work();
      if (accept(value)) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error(`BACKEND_NOT_READY:${last instanceof Error ? last.name : "timeout"}`);
}
async function start(name: string, ref: string, port: number, args: string[], extra: string[] = []) {
  const id = await docker([
    "run",
    "--pull=never",
    "-d",
    "--name",
    `${prefix}-${name}`,
    "--label",
    `${label}=${nonce}`,
    "--network",
    prefix,
    "--network-alias",
    name,
    "--memory",
    name === "tempo" ? "1g" : "512m",
    "--cpus",
    "2",
    "--security-opt",
    "no-new-privileges:true",
    "--cap-drop",
    "ALL",
    "-p",
    `127.0.0.1::${port}`,
    ...extra,
    ref,
    ...args,
  ]);
  containers.push(id);
  const published = await docker(["port", id, `${port}/tcp`]);
  if (!/^127\.0\.0\.1:\d+$/.test(published)) throw Error("LOOPBACK_REQUIRED");
  return { id, url: `http://${published}` };
}
async function volume(name: string) {
  const id = `${prefix}-${name}`;
  await docker(["volume", "create", "--label", `${label}=${nonce}`, id]);
  volumes.push(id);
  return id;
}
const mount = (path: string, target: string) => [
  "--mount",
  `type=bind,source=${resolve(path)},target=${target},readonly`,
];
try {
  await docker(["network", "create", "--label", `${label}=${nonce}`, prefix]);
  network = true;
  const tempo = await start(
    "tempo",
    image("grafana/tempo:"),
    3200,
    ["-config.file=/etc/tempo.yaml", "-target=all"],
    [
      ...mount("ops/research/tempo.yaml", "/etc/tempo.yaml"),
      "--mount",
      `type=volume,source=${await volume("tempo")},target=/var/tempo`,
    ],
  );
  const collector = await start(
    "collector",
    image("otel/opentelemetry-collector-contrib:"),
    4318,
    ["--config=/etc/collector.yaml"],
    mount("ops/research/otel-collector.yaml", "/etc/collector.yaml"),
  );
  const prometheus = await start(
    "prometheus",
    image("prom/prometheus:"),
    9090,
    [
      "--config.file=/etc/prometheus.yaml",
      "--storage.tsdb.path=/prometheus",
      "--storage.tsdb.retention.time=24h",
      "--storage.tsdb.retention.size=256MB",
    ],
    [
      ...mount("ops/research/prometheus.yaml", "/etc/prometheus.yaml"),
      "--mount",
      `type=volume,source=${await volume("prometheus")},target=/prometheus`,
    ],
  );
  const password = randomBytes(32).toString("hex"),
    env = join(directory, "grafana.env");
  await writeFile(
    env,
    `GF_SECURITY_ADMIN_PASSWORD=${password}\nGF_USERS_ALLOW_SIGN_UP=false\nGF_ANALYTICS_REPORTING_ENABLED=false\nGF_ANALYTICS_CHECK_FOR_UPDATES=false\nGF_PLUGINS_PREINSTALL_DISABLED=true\n`,
    { mode: 0o600 },
  );
  const grafana = await start(
    "grafana",
    image("grafana/grafana:"),
    3000,
    [],
    [
      "--env-file",
      env,
      ...mount("ops/research/grafana/provisioning", "/etc/grafana/provisioning"),
      ...mount("ops/research/grafana/dashboards", "/var/lib/grafana/dashboards"),
      "--mount",
      `type=volume,source=${await volume("grafana")},target=/var/lib/grafana`,
    ],
  );
  phase = "tempo-ready";
  await poll(
    async () => fetch(`${tempo.url}/ready`).then((r) => r.status),
    (s) => s === 200,
  );
  phase = "prometheus-ready";
  await poll(
    async () => fetch(`${prometheus.url}/-/ready`).then((r) => r.status),
    (s) => s === 200,
  );
  phase = "grafana-ready";
  await poll(
    async () => fetch(`${grafana.url}/api/health`).then((r) => r.status),
    (s) => s === 200,
  );
  const collectorReady = () =>
    poll(
      async () =>
        fetch(`${collector.url}/v1/traces`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"resourceSpans":[]}',
        }).then((r) => r.status),
      (s) => s === 200,
    );
  phase = "collector-ready";
  await collectorReady();
  bridge = createServer((request, response) => {
    const target = new URL(request.url ?? "/", collector.url);
    const upstream = httpRequest(target, { method: request.method, headers: request.headers }, (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  const proxy = bridge;
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = bridge.address();
  if (!address || typeof address === "string") throw Error("LOOPBACK_REQUIRED");
  telemetry = createTelemetry({} as never, `http://127.0.0.1:${address.port}/`);
  const scope = {
    runId: randomUUID(),
    agentId: randomUUID(),
    turnId: randomUUID(),
    bindingId: "synthetic",
    taskId: "synthetic",
    operationId: randomUUID(),
    operationEpoch: "1",
    manifestDigest: digest({ synthetic: true }),
  };
  const parent: EvidenceEvent = {
    schemaVersion: "fleet.evidence/v1",
    id: randomUUID(),
    scope,
    kind: "run.started",
    streamId: "kernel",
    sequence: "1",
    ordinal: "1",
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    parentIds: [],
    attributes: {},
    artifacts: [],
    coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
  };
  const child: EvidenceEvent = {
    ...parent,
    id: randomUUID(),
    kind: "model.response",
    streamId: "fake-python-rpc",
    ordinal: "2",
    parentIds: [parent.id],
    attributes: { durationMs: "23", queueDelayMs: "11", purpose: "helper" },
    artifacts: [
      {
        id: "prompt-peer-key-sentinel",
        contentType: "text/plain",
        bytes: "1",
        chunks: "1",
        ciphertextDigest: "a".repeat(64),
        privacyClass: "private",
        retentionClass: "30d",
      },
    ],
  };
  if (parseTraceparent(traceLink(parent))?.traceId !== eventContext(child).traceId) throw Error("RPC_LINK_INVALID");
  const started = Date.now();
  await telemetry.projection.publish(parent);
  await telemetry.projection.publish(child);
  await telemetry.projection.publish(child);
  const metric = telemetry.metrics;
  metric.delivery.record(2, { state: "exported" });
  metric.coverage.record(1, { status: "no_capture_failure" });
  metric.bytes.record(1024, { status: "complete" });
  metric.work.record(1);
  metric.unknown.record(0);
  metric.lag.record(0);
  await telemetry.flush();
  const traceId = eventContext(parent).traceId;
  phase = "trace-query";
  const traceBody = await poll(
    async () => {
      const r = await fetch(`${tempo.url}/api/traces/${traceId}`, { headers: { accept: "application/json" } });
      const body = await r.text();
      if (r.ok) await writeFile(join(directory, "trace-response.txt"), body, { mode: 0o600 });
      return r.ok ? body : "";
    },
    (s) => s.includes(child.id),
  );
  if (traceBody.includes("sentinel")) throw Error("PRIVATE_TELEMETRY");
  const traceLag = Date.now() - started;
  await ownedContainer(collector.id);
  await docker(["stop", "-t", "2", collector.id]);
  const recovery = { ...child, id: randomUUID(), ordinal: "3", sequence: "2" };
  let rejected = false;
  try {
    await telemetry.projection.publish(recovery);
  } catch {
    rejected = true;
  }
  if (!rejected || metric.losses !== 1) throw Error("LOSS_NOT_OBSERVED");
  await ownedContainer(collector.id);
  await docker(["start", collector.id]);
  collector.url = `http://${await docker(["port", collector.id, "4318/tcp"])}`;
  phase = "collector-restart";
  await collectorReady();
  await telemetry.projection.publish(recovery);
  await telemetry.flush();
  phase = "recovered-trace";
  const recovered = await poll(
    async () =>
      fetch(`${tempo.url}/api/traces/${traceId}`, { headers: { accept: "application/json" } }).then((r) => r.text()),
    (s) => s.includes(recovery.id),
  );
  if (recovered.includes("sentinel")) throw Error("PRIVATE_TELEMETRY");
  // Multiple real scrapes give rate/histogram panels meaningful synthetic series.
  for (let i = 0; i < 6; i++) {
    await telemetry.projection.publish({
      ...child,
      id: randomUUID(),
      ordinal: String(4 + i),
      sequence: String(3 + i),
      occurredAt: new Date().toISOString(),
      attributes: { durationMs: String(23 + i), queueDelayMs: String(11 + i), purpose: "helper" },
    });
    await telemetry.flush();
    await new Promise((r) => setTimeout(r, 1100));
  }
  const headers = {
    authorization: `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`,
    "content-type": "application/json",
  };
  phase = "dashboard";
  const dashboard = await poll(
    async () => {
      const r = await fetch(`${grafana.url}/api/dashboards/uid/fleet-research-v1`, { headers });
      return r.ok ? ((await r.json()) as { dashboard: { panels: { targets?: { expr: string }[] }[] } }) : undefined;
    },
    (v) => Boolean(v?.dashboard),
  );
  if (!dashboard) throw Error("DASHBOARD_MISSING");
  const panels = dashboard.dashboard.panels.filter((p) => p.targets?.length);
  phase = "loss-metric";
  await poll(
    async () => {
      const r = await fetch(`${prometheus.url}/api/v1/query?query=${encodeURIComponent("fleet_telemetry_loss_total")}`);
      const b = (await r.json()) as { data?: { result?: { value: [number, string] }[] } };
      return b.data?.result?.some((v) => Number(v.value[1]) >= 1) ?? false;
    },
    (v) => v,
  );
  for (const panel of panels) {
    const r = await fetch(`${grafana.url}/api/ds/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: String(Date.now() - 300000),
        to: String(Date.now()),
        queries: [
          {
            refId: "A",
            datasource: { uid: "research-prometheus", type: "prometheus" },
            expr: panel.targets?.[0].expr,
            instant: true,
            format: "time_series",
          },
        ],
      }),
    });
    const result = (await r.json()) as { results?: { A?: { error?: unknown; frames?: unknown[] } } };
    if (!r.ok || result.results?.A?.error || !Array.isArray(result.results?.A?.frames))
      throw Error("DASHBOARD_QUERY_FAILED");
  }
  const namesResponse = await fetch(`${prometheus.url}/api/v1/label/__name__/values`);
  const metricNames = ((await namesResponse.json()) as { data: string[] }).data.filter((name) =>
    name.startsWith("fleet"),
  );
  if (!metricNames.includes("fleet_recording_bytes")) throw Error("RECORDING_BYTES_METRIC_MISSING");
  const traceProxy = await fetch(`${grafana.url}/api/datasources/proxy/uid/research-tempo/api/traces/${traceId}`, {
    headers,
  });
  if (!traceProxy.ok) throw Error("GRAFANA_TRACE_FAILED");
  phase = "browser-render";
  const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath =
    process.env.FLEET_TEST_BROWSER_EXECUTABLE ??
    (await access(localChrome).then(
      () => localChrome,
      () => undefined,
    ));
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({
        httpCredentials: { username: "admin", password },
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    let renderedQueries = 0;
    page.on("response", (response) => {
      if (response.url().includes("/api/ds/query") && response.status() === 200) renderedQueries++;
    });
    const login = await context.request.post(`${grafana.url}/login`, { data: { user: "admin", password } });
    if (!login.ok()) throw Error("GRAFANA_BROWSER_LOGIN_FAILED");
    await page.goto(`${grafana.url}/d/fleet-research-v1/fleet-research-v1`, { waitUntil: "domcontentloaded" });
    await page.getByText("Queue backlog", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await poll(
      async () => page.locator("canvas").count(),
      (n) => n > 0,
      30000,
    );
    if (!renderedQueries) throw Error("DASHBOARD_RENDER_QUERY_MISSING");
    await page.screenshot({ path: resolve(".superpowers/sdd/pact-observation/grafana.png"), fullPage: true });
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(
    JSON.stringify({
      status: "passed",
      traceLagMs: traceLag,
      exportFailures: metric.losses,
      recovered: true,
      dashboardQueries: panels.length,
      metricNames,
      browserVersion: browser.version(),
      traceId,
      versions: images.filter((i) => /^(grafana\/|prom\/|otel\/)/.test(i.image)).map((i) => i.image),
      visualAcceptance: "Chrome rendered dashboard, canvas and successful data requests; screenshot retained",
    }),
  );
} catch (e) {
  for (const id of containers) {
    try {
      await ownedContainer(id);
      const result = await exec("docker", ["logs", "--tail", "30", id], { maxBuffer: 2 * 1024 * 1024 });
      const logs = result.stdout + result.stderr;
      await writeFile(join(directory, `${id.slice(0, 12)}.log`), logs, { mode: 0o600 });
    } catch {}
  }
  console.error(phase, e instanceof Error ? e.message : "OBSERVABILITY_FIXTURE_FAILED");
  // Only synthetic fixture logs; preserve for diagnosis in an ignored location.
  const { cp } = await import("node:fs/promises");
  await cp(directory, resolve(`.tmp/observability-failed-${nonce}`), { recursive: true });
  process.exitCode = 1;
} finally {
  await telemetry?.close().catch(() => {});
  const proxy = bridge;
  if (proxy) await new Promise<void>((resolve) => proxy.close(() => resolve()));
  for (const id of containers.reverse()) {
    await ownedContainer(id);
    await docker(["rm", "-f", id]);
  }
  for (const id of volumes) {
    try {
      await removeOwnedResource("volume", id);
    } catch {
      console.error("OWNED_VOLUME_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  if (network) {
    try {
      await removeOwnedResource("network", prefix);
    } catch {
      console.error("OWNED_NETWORK_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  await rm(directory, { recursive: true, force: true });
}
