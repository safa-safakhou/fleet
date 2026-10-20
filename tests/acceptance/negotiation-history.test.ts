import { expect, it } from "vitest";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { runNegotiationFixture } from "../fixtures/negotiation/driver.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { scriptedProviders } from "../fixtures/negotiation/providers.js";

it.each(["fulfilled", "default"])(
  "C05 %s delivers original history through later engine decisions",
  async (variant) => {
    const cell = negotiationPlan("E3", selections).find((c) => c.family === "C05" && c.variant === variant)!;
    const providers = scriptedProviders(cell);
    providers.capture = ({ evidence, packets, answers, ledger }) => {
      expect(
        packets.some(
          (p) =>
            JSON.stringify(p).includes(variant === "default" ? "defaulted" : "fulfilled") ||
            JSON.stringify(p).includes('"status":"expired"'),
        ),
      ).toBe(true);
      expect(JSON.stringify(packets.at(-1)?.negotiationMemory)).toContain(
        variant === "default" ? "defaulted" : "fulfilled",
      );
      expect(JSON.stringify(answers.at(-1))).toContain(variant === "default" ? "defaulted" : "fulfilled");
      expect(
        evidence.lifecycle
          .filter((l) => ["activation", "delivery", "closure"].includes(l.stage))
          .every((l) => l.scriptedPrefix),
      ).toBe(true);
    };
    const result = await runNegotiationFixture(cell, providers);
    expect(result.status).toBe("pass");
  },
  60000,
);
