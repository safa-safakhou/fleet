import { readFile } from "node:fs/promises";
import { expect, test } from "./test.js";

test.beforeEach(async ({ request }) => {
  await request.post("/__fixture/reset");
});
test("small confounded comparison, explicit exports and source drilldown", async ({ page }, info) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/#research/comparison/60000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "Experiment comparison" })).toBeVisible();
  await expect(page.getByText(/INSUFFICIENT_INDEPENDENT_UNITS/).first()).toBeVisible();
  await expect(page.getByText("missing-bad-run", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Rank candidates" })).toBeDisabled();
  await expect(page.getByText(/No automatic winner/)).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export view CSV" }).click();
  const download = await downloadEvent;
  const path = info.outputPath("comparison.csv");
  await download.saveAs(path);
  const text = await readFile(path, "utf8");
  expect(text).toContain("metricVersion");
  expect(text).toContain("'=SUM");
  for (const format of ["SVG", "PNG"]) {
    const started = page.waitForEvent("download");
    await page.getByRole("button", { name: `Export plot ${format}` }).click();
    const d = await started;
    const exported = info.outputPath(`comparison.${format.toLowerCase()}`);
    await d.saveAs(exported);
    const bytes = await readFile(exported);
    if (format === "PNG") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    else expect(bytes.toString()).toContain("<metadata>");
  }
  await page.screenshot({ path: info.outputPath("comparison.png"), fullPage: true });
  expect(requests.some((x) => /\/start|\/game|\/model/.test(x))).toBe(false);
  await page
    .getByRole("link", { name: /Inspect run synthetic-large/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Research studio" })).toBeVisible();
  await expect(page.getByLabel("Selected event")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Experiment comparison" })).toBeVisible();
  await page.request.post("/__fixture/revoke");
  await page.getByRole("button", { name: "Export view JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByRole("button", { name: "Export view CSV" })).toHaveCount(0);
});
test("full archive uses a bounded private writer and a separate saved key", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).archiveWrites = [];
    (window as any).showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (bytes: Uint8Array) => {
          (window as any).archiveWrites.push(bytes.length);
        },
        close: async () => {
          (window as any).archiveClosed = true;
        },
        abort: async () => {
          (window as any).archiveAborted = true;
        },
      }),
    });
  });
  await page.goto("/#research/run/synthetic-large");
  await page.getByRole("button", { name: "Prepare encrypted archive key" }).click();
  const keyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save private archive key" }).click();
  await keyDownload;
  await page.getByRole("button", { name: "Save complete encrypted archive" }).click();
  await expect(page.getByText(/Encrypted archive saved/)).toBeVisible();
  const writes = await page.evaluate(() => (window as any).archiveWrites as number[]);
  expect(writes.length).toBeGreaterThan(1);
  expect(Math.max(...writes)).toBeLessThanOrEqual(1048576);
});
