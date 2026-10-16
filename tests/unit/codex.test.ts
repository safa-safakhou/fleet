import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexModel } from "../../src/codex.js";
import { decisionSchema } from "../../src/domain.js";
import { RoutedModel } from "../../src/model.js";
import { codexFixture } from "../codex-fixture.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup(mode = "ok") {
  const f = await codexFixture(mode);
  roots.push(f.root);
  return { ...f, model: new CodexModel(f) };
}
const input = () => ({
  model: { route: "codex-cli" as const, model: "selected-fixture", reasoningEffort: "medium" as const },
  messages: [{ role: "user", content: "synthetic facts" }],
  schema: decisionSchema,
  maxOutputTokens: 2000,
  signal: AbortSignal.timeout(5000),
});
describe.skipIf(process.platform !== "linux")("subscription Codex process adapter", () => {
  it("uses ChatGPT auth, explicit model, isolated schema and no inherited service credentials", async () => {
    const f = await setup();
    vi.stubEnv("OPENAI_API_KEY", "PRIVATE_TEXT");
    vi.stubEnv("DATABASE_URL", "PRIVATE_TEXT");
    vi.stubEnv("MODEL_API_KEY", "PRIVATE_TEXT");
    const r = await f.model.decide(input());
    expect(r).toEqual({
      decision: { kind: "wait", summary: "Wait for observed changes" },
      outputText: '{"kind":"wait","summary":"Wait for observed changes"}',
      inputTokens: 123,
      outputTokens: 45,
    });
    const calls = await f.invocations();
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toEqual(
      expect.arrayContaining([
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "selected-fixture",
        'model_reasoning_effort="medium"',
        "read-only",
        'forced_login_method="chatgpt"',
        "features.shell_tool=false",
        "mcp_servers={}",
      ]),
    );
    expect(JSON.stringify(calls)).not.toContain("PRIVATE_TEXT");
    expect(calls[1].cwd).not.toBe(f.home);
    await expect(access(calls[1].cwd)).rejects.toThrow();
    await expect(access(join(f.home, "fleet-execution.lock"))).rejects.toThrow();
    expect(await readFile(join(f.home, "prompt"), "utf8")).toContain("synthetic facts");
  });
  it("never shares a saved agent conversation between executions", async () => {
    const f = await setup();
    await f.model.decide(input());
    await f.model.decide(input());
    const calls = (await f.invocations()).filter((c) => c.args.includes("exec"));
    expect(calls[0].cwd).not.toBe(calls[1].cwd);
    expect(calls.every((c) => !c.args.includes("resume"))).toBe(true);
  });
  it.each([
    ["api", "CODEX_CHATGPT_LOGIN_REQUIRED"],
    ["no-auth", "CODEX_PROCESS_FAILED"],
    ["fail", "CODEX_PROCESS_FAILED"],
    ["large", "CODEX_OUTPUT_LIMIT"],
    ["bad-events", "CODEX_PROCESS_FAILED"],
    ["turn-failed", "CODEX_TURN_FAILED"],
    ["no-completed", "CODEX_INVALID_EVENTS"],
    ["duplicate", "CODEX_INVALID_EVENTS"],
  ])("fails closed for %s without leaking provider text", async (mode, code) => {
    const f = await setup(mode);
    await expect(f.model.decide(input())).rejects.toThrow(code);
    if (mode === "api" || mode === "no-auth") expect(await f.invocations()).toHaveLength(1);
    await expect(access(join(f.home, "fleet-execution.lock"))).rejects.toThrow();
  });
  it("retains final usage when a completed execution has malformed output", async () => {
    const f = await setup("bad-output");
    expect(await f.model.decide(input())).toMatchObject({
      decision: null,
      decisionError: "INVALID_MODEL_OUTPUT",
      inputTokens: 123,
      outputTokens: 45,
    });
  });
  it("preserves absent usage as unknown, without adding cached tokens twice", async () => {
    const f = await setup("unknown");
    const r = await f.model.decide(input());
    expect(r.inputTokens).toBe(null);
    expect(r.outputTokens).toBe(null);
  });
  it("kills an uncooperative process and descendants on cancellation", async () => {
    const f = await setup("sleep"),
      controller = new AbortController();
    const promise = f.model.decide({ ...input(), signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow("CODEX_CANCELLED");
    for (let i = 0; i < 100; i++) {
      try {
        await access(join(f.home, "child"));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    const pid = Number(await readFile(join(f.home, "child"), "utf8"));
    controller.abort();
    await assertion;
    // A killed child can briefly remain a zombie awaiting the host's reaper.
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      expect(stat.split(" ")[2]).toBe("Z");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  });
  it("distinguishes the execution deadline from an operator cancellation and leaves cleanup complete", async () => {
    const f = await setup("sleep");
    await expect(f.model.decide({ ...input(), signal: AbortSignal.timeout(400) })).rejects.toThrow("CODEX_TIMEOUT");
    await expect(access(join(f.home, "fleet-execution.lock"))).rejects.toThrow();
  });
  it("serializes shared subscription login across adapter instances", async () => {
    const f = await setup("sleep"),
      controller = new AbortController();
    const promise = f.model.decide({ ...input(), signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow("CODEX_CANCELLED");
    for (let i = 0; i < 100; i++) {
      try {
        await access(join(f.home, "child"));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    await expect(new CodexModel(f).decide(input())).rejects.toThrow("CODEX_BUSY");
    controller.abort();
    await assertion;
  });
  it("rejects missing or shared home setup before executing", async () => {
    await expect(new CodexModel({}).decide(input())).rejects.toThrow("CODEX_CONFIGURATION_REQUIRED");
    const f = await setup();
    await chmod(f.home, 0o755);
    await expect(f.model.decide(input())).rejects.toThrow("CODEX_PRIVATE_HOME_REQUIRED");
    await expect(f.invocations()).rejects.toThrow();
  });
  it("keeps the kernel lock after worker death and releases it after the independent process deadline", async () => {
    const f = await setup("sleep");
    const script = `import {CodexModel} from './src/codex.ts';await new CodexModel(JSON.parse(process.argv[1]),1500).decide({...JSON.parse(process.argv[2]),signal:AbortSignal.timeout(10000)}).catch(()=>{});`;
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        script,
        JSON.stringify({ home: f.home, executable: f.executable }),
        JSON.stringify({ ...input(), signal: undefined }),
      ],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    // The child supplies its own bounded signal; JSON cannot transport an AbortSignal.
    try {
      await expect
        .poll(
          async () => {
            try {
              await access(join(f.home, "child"));
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 5000, interval: 20 },
        )
        .toBe(true);
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      await expect(new CodexModel(f).decide(input())).rejects.toThrow("CODEX_BUSY");
      await writeFile(join(f.home, "mode"), "ok");
      await expect
        .poll(
          async () => {
            try {
              return (await new CodexModel(f).decide(input())).inputTokens;
            } catch {
              return null;
            }
          },
          { timeout: 5000, interval: 200 },
        )
        .toBe(123);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 12000);
  it("routes only Codex selections to the CLI", async () => {
    const http = { decide: vi.fn() },
      codex = { decide: vi.fn() };
    const model = new RoutedModel(http, codex);
    await model.decide(input());
    expect(codex.decide).toHaveBeenCalledOnce();
    expect(http.decide).not.toHaveBeenCalled();
    await model.decide({ ...input(), model: { route: "ollama", model: "fixture" } });
    expect(http.decide).toHaveBeenCalledOnce();
  });
});
