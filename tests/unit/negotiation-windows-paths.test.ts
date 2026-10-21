import { expect, it } from "vitest";
import { validateWindowsOwnedRoots } from "../../scripts/lib/negotiation-windows-paths.js";

it("anchors app-container redirection at its canonical base while rejecting child redirection", () => {
  const logical = "C:\\Users\\Owner\\AppData\\Local\\PACT\\Negotiation",
    canonical = "C:\\Users\\Owner\\AppData\\Local\\Packages\\Codex\\LocalCache\\Local\\PACT\\Negotiation",
    id = "1eb99a67-c484-45d1-8c79-38da135d45fb",
    bundle = `${logical}\\bundles\\${id}`,
    root = `${logical}\\E1\\${id}`;
  expect(() =>
    validateWindowsOwnedRoots(
      logical,
      bundle,
      root,
      canonical,
      `${canonical}\\bundles\\${id}`,
      `${canonical}\\E1\\${id}`,
    ),
  ).not.toThrow();
  expect(() =>
    validateWindowsOwnedRoots(logical, bundle, root, canonical, `C:\\elsewhere\\${id}`, `${canonical}\\E1\\${id}`),
  ).toThrow();
  expect(() =>
    validateWindowsOwnedRoots(
      logical,
      bundle,
      root,
      canonical,
      `${canonical}\\bundles\\${id}`,
      `${canonical}\\E2\\${id}`,
    ),
  ).toThrow();
});
