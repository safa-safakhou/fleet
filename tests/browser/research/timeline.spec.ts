import { writeFile } from "node:fs/promises";
import { expect, test } from "./test.js";

test.beforeEach(async ({ request }) => {
  await request.post("/__fixture/reset");
});
test("bounded timeline, causal navigation, filters, keyboard and revoked private cache", async ({ page }, info) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/#research/run/synthetic-large");
  await expect(page.getByRole("heading", { name: "Research studio" })).toBeVisible();
  await expect(page.getByText("100000 recorded events", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load next event page" })).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeLessThanOrEqual(200);
  expect(requests.filter((x) => x.includes("/events?")).length).toBe(1);
  const first = page.getByRole("button", { name: /Inspect event/ }).first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Selected event")).toBeVisible();
  await page.getByLabel("Search loaded events").fill("queue");
  await expect(page.getByText(/unmeasured gap|censored/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("timeline.png"), fullPage: true });
  await page.request.post("/__fixture/revoke");
  await page.getByRole("button", { name: "Refresh authorization" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Selected event")).toHaveCount(0);
  expect(requests.filter((x) => /\/start|\/model|\/game|\/metrics$/.test(x))).toEqual([]);
});
test("synthetic performance and bounded causal graph", async ({ page, request, browser }, info) => {
  await request.post("/__fixture/reset");
  await page.goto("/#research/run/synthetic-large");
  await expect(page.getByRole("button", { name: /Inspect event/ }).first()).toBeVisible();
  const interaction = await page.evaluate(
    () => performance.getEntriesByName("fleet.timeline.interaction")[0]?.duration,
  );
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t = performance.now();
    const response = await request.get(
      `/api/research/runs/synthetic-large/events?snapshotId=10000000-0000-4000-8000-000000000001&cursor=${i * 200}`,
    );
    expect(response.ok()).toBe(true);
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  await info.attach("performance.json", {
    body: JSON.stringify({
      browser: browser.version(),
      runner: process.platform,
      viewport: info.project.name,
      eventPopulation: 100000,
      interactionMs: interaction,
      pageApiP95Ms: samples[18],
      samples: 20,
    }),
    contentType: "application/json",
  });
  await writeFile(
    info.outputPath("performance.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        runner: process.platform,
        viewport: info.project.name,
        eventPopulation: 100000,
        interactionMs: interaction,
        pageApiP95Ms: samples[18],
        samples: 20,
      },
      null,
      2,
    ),
  );
  await page.getByRole("button", { name: "Load next event page" }).click();
  await page.getByRole("button", { name: "Causal graph", exact: true }).click();
  await expect(page.getByRole("img", { name: "Explicit event causality" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("causal-graph.png"), fullPage: true });
});
test("late filtered pages cannot replace the current selection", async ({ page }) => {
  await page.goto("/#research/run/synthetic-large");
  await expect(page.getByRole("button", { name: /Inspect event/ }).first()).toBeVisible();
  await page.route("**/events?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") === "model.response")
      await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.getByLabel("Event family").selectOption("model.response");
  await page.getByLabel("Event family").selectOption("queue.enter");
  await expect(page.getByRole("cell", { name: "queue.enter", exact: true }).first()).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByRole("cell", { name: "model.response", exact: true })).toHaveCount(0);
});
test("legacy turn inspector opens its recorded research run without execution", async ({ page }) => {
  await page.goto("/#research/turn/80000000-0000-4000-8000-000000000001");
  await page.getByRole("link", { name: "Open recorded run synthetic-large" }).click();
  await expect(page.getByRole("heading", { name: "Research studio" })).toBeVisible();
  await expect(page.getByText("100000 recorded events", { exact: true })).toBeVisible();
});
