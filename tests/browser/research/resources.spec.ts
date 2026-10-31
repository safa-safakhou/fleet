import { expect, test } from "./test.js";

test.beforeEach(async ({ request }) => {
  await request.post("/__fixture/reset");
});
test("full-population metrics, explicit unknowns, receipts and independent completion", async ({ page }, info) => {
  await page.goto("/#research/run/synthetic-large");
  await page.getByRole("button", { name: "Resources & outcomes" }).click();
  await expect(page.getByText("2 unresolved allocations", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "205", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unavailable / unknown", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Admission receipt; completion not established", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "verified-upgrade", exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: /Resource.*call/ }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("resources-outcomes.png"), fullPage: true });
});
