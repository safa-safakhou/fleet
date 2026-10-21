import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PrivateNegotiationReview } from "../../scripts/lib/negotiation-review-channel.js";

it("withholds the next effect until an exact encrypted review and rejects late or substituted responses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "negotiation-review-"));
  try {
    const channel = new PrivateNegotiationReview(dir, randomBytes(32).toString("base64"), randomUUID());
    const id = randomUUID();
    let done = false;
    const pending = channel
      .request("response", id, { privatePeerText: "private synthetic text" }, Date.now() + 5000)
      .then((r) => {
        done = true;
        return r;
      });
    const request = await channel.inspectWhenPresent("response", id, Date.now() + 2000);
    expect(done).toBe(false);
    expect(await readFile(join(dir, `response-${id}.request.json`), "utf8")).not.toContain("private synthetic text");
    await expect(
      channel.respond("response", id, "0".repeat(64), { verdict: "continue", reasonCodes: [] }),
    ).rejects.toThrow("REVIEW_SCOPE");
    const submissions = await Promise.allSettled([
      channel.respond("response", id, request.digest, { verdict: "continue", reasonCodes: [] }),
      channel.respond("response", id, request.digest, { verdict: "continue", reasonCodes: [] }),
    ]);
    expect(submissions.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await pending).toEqual({ verdict: "continue", reasonCodes: [] });
    await expect(channel.request("response", randomUUID(), {}, Date.now() - 1)).rejects.toThrow("REVIEW_DEADLINE");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
