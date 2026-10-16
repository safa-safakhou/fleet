import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunReport } from "../../web/runs.js";

describe("run debugging report", () => {
  it("shows ordered step titles, precise timing, escaped payloads and missing coverage", () => {
    const html = renderToStaticMarkup(
      <RunReport
        data={{
          agent: { id: "agent", name: "Agent 01" },
          coverage: "Historical coverage unavailable",
          executions: [],
          turn: {
            id: "run",
            agent_id: "agent",
            cohort_id: "cohort",
            state: "finished",
            code: "WAIT",
            started_at: "2026-10-16T10:00:00.000Z",
            finished_at: "2026-10-16T10:00:02.500Z",
            calls: 1,
            actions: 0,
            summary: "Wait",
            pending_command: null,
            events: [
              {
                id: "e1",
                sequence: "1",
                at: "2026-10-16T10:00:01.250Z",
                stage: "ready",
                label: "Debug: Model request",
                detail: { input: "<script>secret</script>" },
              },
            ],
          },
        }}
      />,
    );
    expect(html).toContain("Model request");
    expect(html).toContain("+1.250 s");
    expect(html).toContain("2.500 s");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Historical coverage unavailable");
  });
});
