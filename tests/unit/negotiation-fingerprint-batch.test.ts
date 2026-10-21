import { expect, it } from "vitest";
import { splitOwnedFingerprintSections } from "../../scripts/backup-negotiation-fixture.js";

it("preserves exact COPY row bytes, empty tables and sequence rows without trusting marker-like user text", () => {
  const first = Buffer.from(JSON.stringify({ text: "line1\nline2 __pact_fingerprint_1__", unicode: "żółw" }) + "\n"),
    sequence = Buffer.from("1:true\n");
  const framed = Buffer.concat([
    Buffer.from("__pact_fingerprint_0__\n"),
    first,
    Buffer.from("__pact_fingerprint_1__\n__pact_fingerprint_2__\n"),
    sequence,
    Buffer.from("__pact_fingerprint_end__\n"),
  ]);
  expect(splitOwnedFingerprintSections(framed, 3)).toEqual([first, Buffer.alloc(0), sequence]);
  expect(() => splitOwnedFingerprintSections(Buffer.concat([framed, Buffer.from("extra\n")]), 3)).toThrow(
    "OWNED_FINGERPRINT_FRAMING",
  );
  expect(() => splitOwnedFingerprintSections(framed, 4)).toThrow("OWNED_FINGERPRINT_FRAMING");
  expect(splitOwnedFingerprintSections(Buffer.from("__pact_fingerprint_end__\n"), 0)).toEqual([]);
});
