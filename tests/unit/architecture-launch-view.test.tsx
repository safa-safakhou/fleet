import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArchitectureFields, fieldProblem } from "../../web/architecture-fields.js";
import { exactKey, LaunchController, LaunchWizard } from "../../web/launch.js";

it("keeps exact versions distinct and never starts on selection or draft save", async () => {
  const requests: string[] = [];
  const api = async <T,>(path: string): Promise<T> => {
    requests.push(path);
    return { draftId: "draft", digest: "digest", valid: true, ready: false, checks: [] } as T;
  };
  const controller = new LaunchController(api);
  expect(exactKey({ id: "fixture", version: "1" })).not.toBe(exactKey({ id: "fixture", version: "2" }));
  controller.edit({ architecture: { id: "fixture", version: "2" } });
  await controller.save();
  expect(requests).toEqual(["/launch/drafts"]);
  await expect(controller.start()).rejects.toThrow("CHECK_REQUIRED");
  await controller.check();
  await expect(controller.start()).rejects.toThrow("LAUNCH_NOT_READY");
});

it("invalidates checked readiness on edits and resumes a saved draft by digest", async () => {
  const controller = new LaunchController(async <T,>() => ({ id: "draft", digest: "saved", spec: { depth: 2 } }) as T);
  await controller.resume("draft");
  expect(controller.draft).toEqual({ draftId: "draft", digest: "saved" });
  expect(controller.spec).toEqual({ depth: 2 });
  controller.edit({ depth: 3 });
  expect(controller.readiness).toBeNull();
  await expect(controller.start()).rejects.toThrow("CHECK_REQUIRED");
});

it("renders supported bounded fields and precisely rejects unsupported schemas", () => {
  const schema = {
    type: "object",
    properties: {
      label: { type: "string", maxLength: 30 },
      enabled: { type: "boolean" },
      depth: { type: "integer", minimum: 1, maximum: 3 },
      mode: { type: "string", enum: ["off", "advisory"] },
      tags: { type: "array", maxItems: 3, items: { type: "string" } },
      nested: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
    },
    additionalProperties: false,
  };
  expect(fieldProblem(schema)).toBeNull();
  const html = renderToStaticMarkup(
    <ArchitectureFields
      schema={schema}
      value={{ label: "<script>x</script>", enabled: true, depth: 2, mode: "off", tags: ["a"], nested: {} }}
      onChange={() => {}}
    />,
  );
  expect(html).toContain("checkbox");
  expect(html).toContain("advisory");
  expect(html).not.toContain("<script>");
  expect(fieldProblem({ type: "object", properties: { x: { $ref: "remote" } } })).toContain("/x");
  expect(fieldProblem({ type: "array", items: { type: "string" } })).toContain("bounded");
});

it("renders an inactive wizard without starting or provisioning anything", () => {
  const html = renderToStaticMarkup(
    <LaunchWizard api={async <T,>() => ({}) as T} onCreated={() => {}} onStarted={() => {}} />,
  );
  expect(html).toContain("Launch an architecture");
  expect(html).toContain("Resume draft");
  expect(html).not.toContain("Start fleet");
});
