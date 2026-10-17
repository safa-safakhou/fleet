import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProfileComparison } from "../../web/profiles.js";

it("renders four profiles with drift, missing outcomes and escaped operator text", () => {
  const html = renderToStaticMarkup(
    <ProfileComparison
      open={() => {}}
      report={{
        design: "interacting_world",
        asOf: "2026-10-17T18:00:00.000Z",
        coverage: "Interacting observations, no causal winner",
        cohorts: ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"].map((id, i) => ({
          cohortId: id,
          name: i === 0 ? "<script>private</script>" : id,
          profile: i === 1 ? null : { id, version: "1" },
          configurationDigest: "digest",
          configurationDrift: i === 2,
          state: "paused",
          metrics: { turns: 5, calls: 0, unknownAllocatedTokens: "40000" },
          coverage: { details: "Historical detail unavailable", materialOutcomes: "Unmeasured; admission alone" },
        })),
      }}
    />,
  );
  expect(html.match(/Inspect fleet/g)).toHaveLength(4);
  expect(html).toContain("Configuration changed since linking");
  expect(html).toContain("2026-10-17T18:00:00.000Z");
  expect(html).toContain("Historical profile unavailable");
  expect(html).toContain("40000");
  expect(html).toContain("Unmeasured");
  expect(html).not.toContain("<script>");
});
