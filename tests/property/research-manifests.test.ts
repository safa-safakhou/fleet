import fc from "fast-check";
import { expect, test } from "vitest";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";

import { propertyOptions, propertySelected } from "./options.js";

test.skipIf(!propertySelected("protection"))("all configurable protection switches are non-disableable", () =>
  fc.assert(
    fc.property(
      fc.constantFrom("identity", "permission", "lease", "privacy", "budget", "fencing", "journal"),
      fc.string({ maxLength: 100 }),
      (protection, seed) => {
        const input = manifestInput();
        input.seed = seed || "seed";
        (input.protections as Record<string, boolean>)[protection] = false;
        expect(() => compileManifest(input, capability)).toThrow("PROTECTION_REQUIRED");
      },
    ),
    propertyOptions("protection"),
  ),
);
test.skipIf(!propertySelected("canonical"))("canonical manifests retain arbitrary Unicode opaque identifiers", () =>
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 100 }), (name) => {
      const input = manifestInput();
      input.profile.id = name;
      expect(compileManifest(input, capability).manifest.profile.id).toBe(name);
    }),
    propertyOptions("canonical"),
  ),
);
