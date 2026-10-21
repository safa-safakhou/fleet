import { expect, it } from "vitest";
import {
  validateWindowsOwnedRoots,
  validateWindowsProviderStore,
  windowsInspectionEnvironment,
} from "../../scripts/lib/negotiation-windows-paths.js";

it("does not pass host PowerShell module overrides into system inspection", () => {
  const parent = {
    SystemRoot: "C:\\Windows",
    PSModulePath: "incompatible-host-modules",
    psmodulepath: "second-case",
    LOCALAPPDATA: "private-root",
  };
  expect(windowsInspectionEnvironment(parent)).toEqual({ SystemRoot: "C:\\Windows", LOCALAPPDATA: "private-root" });
  expect(parent.PSModulePath).toBe("incompatible-host-modules");
});

it("anchors app-container redirection at its canonical base while rejecting child redirection", () => {
  const logical = "C:\\Users\\Owner\\AppData\\Local\\PACT\\Negotiation",
    canonical = "C:\\Users\\Owner\\AppData\\Local\\Packages\\Codex\\LocalCache\\Local\\PACT\\Negotiation",
    id = "1eb99a67-c484-45d1-8c79-38da135d45fb",
    bundle = `${logical}\\bundles\\${id}`,
    root = `${logical}\\E1\\${id}`;
  expect(() =>
    validateWindowsProviderStore(
      logical,
      `${logical}\\provider-stores\\${id}`,
      canonical,
      `${canonical}\\provider-stores\\${id}`,
    ),
  ).not.toThrow();
  expect(() =>
    validateWindowsProviderStore(
      logical,
      `${logical}\\provider-stores\\${id}`,
      canonical,
      `${canonical}\\elsewhere\\${id}`,
    ),
  ).toThrow("OWNED_PROVIDER_STORE_REQUIRED");
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
