import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/research",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  outputDir: ".superpowers/sdd/2026-10-30-pact-research-06-studio/browser",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8876", headless: true, trace: "retain-on-failure" },
  projects: [
    { name: "wide", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "narrow", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node --import tsx scripts/serve-research-ui-fixture.ts",
    url: "http://127.0.0.1:8876/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
