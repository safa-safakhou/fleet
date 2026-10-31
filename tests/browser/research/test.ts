import { test as base, expect } from "@playwright/test";

export { expect };
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        !/^Failed to load resource: the server responded with a status of (400|401|403|404|410) /.test(m.text())
      )
        errors.push(m.text());
    });
    page.on("request", (r) => {
      if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(baseURL!).origin) external.push(r.url());
    });
    await use(page);
    if (page.viewportSize()?.width === 390)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        "Narrow view contains horizontal scrolling inside its panels",
      ).toBeLessThanOrEqual(391);
    expect(errors, "No browser/runtime errors").toEqual([]);
    expect(external, "Only the owned fixture origin is contacted").toEqual([]);
  },
});
