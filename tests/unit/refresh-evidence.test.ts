import { expect, it } from "vitest";
import { refreshFailureEvidence } from "../../src/games/pact/refresh-evidence.js";
import { RemoteRejection } from "../../src/http.js";

const refused = () => Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" });
it("requires local pre-HTTP refusal rather than a gateway status, prose or ambiguous disconnect", () => {
  expect(refreshFailureEvidence(new TypeError("fetch failed", { cause: refused() }))).toBe("not_processed");
  expect(
    refreshFailureEvidence(new TypeError("fetch failed", { cause: new AggregateError([refused(), refused()]) })),
  ).toBe("not_processed");
  for (const error of [
    new RemoteRejection("TRANSPORT_UNCERTAIN", 502),
    new Error("ECONNREFUSED"),
    new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }),
    new TypeError("fetch failed", { cause: new AggregateError([refused(), { code: "ECONNRESET" }]) }),
  ])
    expect(refreshFailureEvidence(error)).toBe("rotation_unknown");
  expect(refreshFailureEvidence(new RemoteRejection("INVALID_GRANT", 400))).toBe("rejected");
});
