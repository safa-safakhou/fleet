import { expect, it } from "vitest";
import { planRuntimePackages, type RuntimePackage } from "../../scripts/lib/negotiation-package-graph.js";

it("preserves incompatible dependency versions and closes cycles through the correct native lookup scope", async () => {
  const a: RuntimePackage = { directory: "/a", json: { name: "a", version: "1", dependencies: { uri: "3", b: "1" } } };
  const b: RuntimePackage = { directory: "/b", json: { name: "b", version: "1", dependencies: { uri: "4", a: "1" } } };
  const u3: RuntimePackage = { directory: "/uri3", json: { name: "uri", version: "3" } };
  const u4: RuntimePackage = { directory: "/uri4", json: { name: "uri", version: "4" } };
  const nodes = await planRuntimePackages("/owned", [a, b], async (name, from) =>
    name === "a" ? a : name === "b" ? b : from === "/a" ? u3 : u4,
  );
  expect(nodes.filter((n) => n.pkg.json.name === "uri").map((n) => [n.pkg.json.version, n.target])).toEqual([
    ["3", "/owned/node_modules/a/node_modules/uri"],
    ["4", "/owned/node_modules/b/node_modules/uri"],
  ]);
  expect(nodes.filter((n) => n.pkg.json.name === "a")).toHaveLength(1);
  expect(nodes.filter((n) => n.pkg.json.name === "b")).toHaveLength(1);
});
