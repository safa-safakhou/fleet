import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { SkillsView } from "../../web/skills.js";
import { SpecialistsView } from "../../web/specialists.js";

it("escapes all peer/skill prose and keeps admission distinct from outcome evidence", () => {
  const attack = "<script>danger()</script>",
    html = renderToStaticMarkup(
      <>
        <SpecialistsView
          data={{
            consent: true,
            participants: [{ id: attack, version: 1, state: { goals: [attack] } }],
            receipts: [{ status: "confirmed", receiptOnly: true }],
            originals: [],
          }}
        />
        <SkillsView
          data={{ skills: [{ ref: { id: "one" }, summary: { purpose: attack }, status: "advisory", author: attack }] }}
        />
      </>,
    );
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("receipts");
  expect(html).toContain("originals");
});
it("exposes six families with skills only on the new exact autonomous profile and defaults to advice", () => {
  const list = builtinArchitectures().list();
  expect(new Set(list.map((x) => x.ref.id)).size).toBe(6);
  const own = list.find((x) => x.ref.id === "autonomous-specialists")!;
  expect(own.defaults).toMatchObject({ learning: true, skillMode: "advisory" });
  expect(own.skillModes).toContain("guarded");
  expect(list.filter((x) => x.ref.id !== own.ref.id).every((x) => !x.modules.some((m) => m.id === "skills"))).toBe(
    true,
  );
});
