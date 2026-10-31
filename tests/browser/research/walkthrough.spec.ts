import { expect, test } from "./test.js";

test("researcher_can_reconstruct_and_compare across all seven view families", async ({ page, request }, info) => {
  await request.post("/__fixture/reset");
  await page.goto("/#research/run/synthetic-large?event=20000000-0000-4000-8000-000000000002");
  await expect(page.getByLabel("Selected event")).toBeVisible();
  await expect(page.getByText("100000 recorded events", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run overview" })).toBeVisible();
  for (const tab of ["Timeline", "Causal graph", "Context & lineage", "Manifest", "Resources & outcomes"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.screenshot({ path: info.outputPath(`${tab.replaceAll(/[^a-z]/gi, "-")}.png`), fullPage: true });
  }
  await expect(page.getByText("2 unresolved allocations", { exact: true })).toBeVisible();
  await page.goto("/#research/comparison/60000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "Experiment comparison" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rank candidates" })).toBeDisabled();
  await expect(page.getByText(/INSUFFICIENT_INDEPENDENT_UNITS/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("comparison.png"), fullPage: true });
});

test("native recorded failure investigation renders its real snapshot, metrics and context", async ({
  page,
  request,
}, info) => {
  const response = await request.get("/__fixture/native");
  expect(response.ok(), "Run the owned native research-engine acceptance first").toBe(true);
  const native = await response.json();
  expect(native.reconciliation).toMatchObject({ calls: 1, commands: 1, archive: { status: "verified", gaps: 0 } });
  await page.clock.setFixedTime(new Date(native.createdAt));
  await page.goto(`/#research/run/${encodeURIComponent(native.runId)}`);
  await expect(page.getByText(`${native.reconciliation.events} recorded events`, { exact: true })).toBeVisible();
  await page.getByLabel("Event family").selectOption("context.prepared");
  await page
    .getByRole("button", { name: /Inspect event/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Context & lineage" }).click();
  await page
    .getByRole("button", { name: /Load artifact/ })
    .first()
    .click();
  await expect(page.getByText(/Move to a4/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("native-context.png"), fullPage: true });
  await page.getByRole("button", { name: "Resources & outcomes" }).click();
  await expect(page.getByText("position", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("native-outcome.png"), fullPage: true });
});
