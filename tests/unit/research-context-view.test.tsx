import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { contextView, SourceSpan } from "../../web/research/context.js";

test("final_input_is_auditable without executing peer HTML or concealing omissions", () => {
  const messages = [{ role: "user", content: "fact é <img src=x onerror=alert(1)>" }];
  const view = contextView({
    messages,
    schema: { type: "object" },
    lineage: {
      spans: [
        {
          id: "transformed",
          sourceClass: "peer-claim",
          messageIndex: 0,
          startByte: 0,
          endByte: 7,
          sourceRefs: ["source-a"],
          transform: "excerpt@1",
        },
      ],
      omitted: [
        { id: "expired", reason: "expired" },
        { id: "capacity", reason: "capacity" },
      ],
      mandatoryCoverage: { expected: 2, recorded: 1, status: "partial" },
    },
  });
  expect(view.messages).toEqual(messages);
  expect(view.schema).toEqual({ type: "object" });
  expect(view.lineage.omitted.map((x) => x.reason)).toEqual(["expired", "capacity"]);
  const html = renderToStaticMarkup(<SourceSpan text={messages[0].content} startByte={0} endByte={7} />);
  expect(html).toContain("fact é");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
});
