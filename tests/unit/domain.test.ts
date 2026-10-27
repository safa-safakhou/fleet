import { describe, expect, it } from "vitest";
import {
  Budget,
  Draft,
  ModelConfig,
  nextSlot,
  safeCode,
  strategy,
  supportsExtendedContextBudget,
} from "../../src/domain.js";
import { actionContract, actionKinds, actionSchema, isRead, validateTool } from "../../src/games/pact/contracts.js";
import { Vault } from "../../src/vault.js";
import { budget, continuousBudget, key } from "../helpers.js";

describe("schedule and values", () => {
  it("admits an explicitly accounted local context without trusting an unqualified route", () => {
    const extended = Budget.parse({
      ...budget,
      inputByteLimit: 128000,
      perCallTokenLimit: 65536,
      executionAccountingAccepted: true,
    });
    const model = {
      route: "openai-compatible" as const,
      provider: "vllm" as const,
      model: "nemotron-4b",
      contextWindowTokens: 65536,
    };
    expect(ModelConfig.safeParse(model).success).toBe(true);
    expect(supportsExtendedContextBudget(model, extended)).toBe(true);
    expect(supportsExtendedContextBudget({ ...model, contextWindowTokens: undefined }, extended)).toBe(false);
    expect(supportsExtendedContextBudget({ ...model, provider: undefined }, extended)).toBe(false);
    expect(supportsExtendedContextBudget(model, { ...extended, perCallTokenLimit: 40000 })).toBe(false);
  });
  it("admits explicit Codex large-context budgets without enlarging ordinary model allowances", () => {
    const extended = {
      ...budget,
      mode: "finite" as const,
      inputByteLimit: 1048576,
      perCallTokenLimit: 1200000,
      tokenLimit: 600000000,
      concurrency: 1,
      executionAccountingAccepted: true as const,
    };
    const model = { route: "codex-cli" as const, model: "gpt-6.1-terra", contextWindowTokens: 500000 };
    expect(Budget.safeParse(extended).success).toBe(true);
    expect(ModelConfig.safeParse(model).success).toBe(true);
    expect(supportsExtendedContextBudget(model, extended)).toBe(true);
    expect(Budget.safeParse({ ...extended, executionAccountingAccepted: undefined }).success).toBe(false);
    expect(supportsExtendedContextBudget({ route: "ollama", model: "existing" }, extended)).toBe(false);
    expect(supportsExtendedContextBudget({ route: "codex-cli", model: "unqualified" }, extended)).toBe(false);
    expect(ModelConfig.safeParse({ ...model, route: "ollama" }).success).toBe(false);
    expect(supportsExtendedContextBudget({ route: "ollama", model: "existing" }, Budget.parse(budget))).toBe(true);
  });
  it("skips missed slots rather than replaying an outage", () => {
    expect(nextSlot(0, 900000, 18000, 7200000)).toBe(7218000);
    expect(nextSlot(0, 900000, 0, 0)).toBe(900000);
  });
  it("preserves independent reproducible profiles", () => {
    expect(strategy("guardian", "same")).toEqual(strategy("guardian", "same"));
    expect(strategy("expansionist", "same").riskTolerance).toBeGreaterThan(strategy("guardian", "same").riskTolerance);
  });
  it("rejects unsupported intervals and empty budgets", () => {
    expect(
      Draft.safeParse({ name: "Test", count: 0, intervalMinutes: 5, seed: "x", strategies: ["guardian"] }).success,
    ).toBe(false);
    expect(Budget.safeParse({ ...budget, tokenLimit: 1 }).success).toBe(false);
  });
  it("redacts raw provider failures", () => {
    expect(safeCode(Error("secret-private-token"))).toBe("TRANSPORT_UNCERTAIN");
  });
  it("continuous execution needs explicit consent and cannot hide finite limits or deadlines", () => {
    expect(Budget.safeParse(continuousBudget).success).toBe(true);
    expect(Budget.safeParse({ ...continuousBudget, continuousExecutionAccepted: undefined }).success).toBe(false);
    expect(Budget.safeParse({ ...continuousBudget, callLimit: 100 }).success).toBe(false);
    expect(Budget.safeParse({ ...continuousBudget, deadlineAt: budget.deadlineAt }).success).toBe(false);
    expect(Budget.safeParse({ ...budget, deadlineAt: null }).success).toBe(false);
    expect(Budget.safeParse({ ...continuousBudget, perCallTokenLimit: 1000, maxOutputTokens: 2000 }).success).toBe(
      false,
    );
  });
});
describe("independent public contracts and vault", () => {
  it("materializes advertised tool defaults without masking missing or invalid arguments", () => {
    const tool = {
      name: "pact_agent_guide_v1",
      inputSchema: {
        type: "object",
        properties: { topic: { type: "string", enum: ["start", "diplomacy"], default: "start" } },
        required: ["topic"],
        additionalProperties: false,
      },
    };
    const args = {};
    validateTool(tool, args);
    expect(args).toEqual({ topic: "start" });
    expect(() => validateTool(tool, { topic: "invented" })).toThrow("INVALID_TOOL_ARGUMENTS");
    expect(() => validateTool(tool, { extra: true })).toThrow("INVALID_TOOL_ARGUMENTS");
    expect(() =>
      validateTool({ name: "pact_required", inputSchema: { type: "object", required: ["id"] } }, {}),
    ).toThrow("INVALID_TOOL_ARGUMENTS");
  });
  it("exposes all reviewed gameplay families without admin authority", () => {
    expect(actionKinds.length).toBeGreaterThanOrEqual(58);
    expect(actionKinds).toContain("court.join");
    expect(actionKinds).toContain("game.raid.declare");
    expect(() => actionContract({ kind: "mandate.raise" })).toThrow();
    expect(actionSchema("game.building.queue")).toBeTruthy();
  });
  it("allows only explicitly read-only game tools", () => {
    expect(isRead({ name: "shell", inputSchema: {}, annotations: { readOnlyHint: true } })).toBe(false);
    expect(isRead({ name: "pact_game_action_v2", inputSchema: {}, annotations: { readOnlyHint: false } })).toBe(false);
  });
  it("encrypts secrets and prevents a swapped account binding", () => {
    const v = new Vault(key),
      cipher = v.encrypt({ token: "synthetic-test-secret" }, "agent:a");
    expect(cipher).not.toContain("synthetic-test-secret");
    expect(v.decrypt(cipher, "agent:a")).toEqual({ token: "synthetic-test-secret" });
    expect(() => v.decrypt(cipher, "agent:b")).toThrow();
  });
  it("rejects malformed vault keys", () => {
    expect(() => new Vault("bad")).toThrow();
  });
});
