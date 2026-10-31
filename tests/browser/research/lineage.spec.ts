import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/__fixture/reset");
});
test("exact input, omissions, recorded transitions, large artifact and revoked source", async ({ page }, info) => {
  const artifactRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/artifacts/")) artifactRequests.push(r.url());
  });
  await page.goto("/#research/run/synthetic-large?event=20000000-0000-4000-8000-000000000002");
  await expect(page.getByLabel("Selected event")).toBeVisible();
  expect(artifactRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Context & lineage" }).click();
  await page.getByRole("button", { name: /Load artifact .*000001/ }).click();
  await expect(page.getByRole("button", { name: "Highlight contradictory-peer" })).toBeVisible();
  await expect(page.getByText("expired", { exact: true }).first()).toBeVisible();
  expect(await page.locator("img[src=x]").count()).toBe(0);
  await page.getByRole("button", { name: "Highlight contradictory-peer" }).click();
  await expect(page.locator("mark")).toHaveText("fact é");
  await page.getByRole("button", { name: "lineage", exact: true }).click();
  await expect(page.getByText(/Recorded state transition:/)).toContainText("thinking");
  await page.screenshot({ path: info.outputPath("recorded-lineage.png"), fullPage: true });
  await page.getByRole("button", { name: "Captured bytes" }).click();
  await expect(page.getByLabel("Captured artifact text")).toContainText("messages");
  await page.getByRole("button", { name: /Load artifact .*000002/ }).click();
  await expect(page.getByText(/Partial body.*16777216/)).toBeVisible();
  expect(artifactRequests.filter((x) => x.includes("000002")).length).toBe(1);
  await page.screenshot({ path: info.outputPath("context-lineage.png"), fullPage: true });
  await page.request.post("/__fixture/revoke");
  await page.getByRole("button", { name: "Next artifact chunk" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Captured artifact text")).toHaveCount(0);
});
