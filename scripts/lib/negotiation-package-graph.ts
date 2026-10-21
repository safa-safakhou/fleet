import { join } from "node:path";
export type RuntimePackage = {
  directory: string;
  json: { name: string; version: string; dependencies?: Record<string, string> };
};
export type RuntimePackageNode = { pkg: RuntimePackage; target: string };
/** Preserve Node's nested resolution contexts. A package name is not a unique
 * dependency identity; flattening can silently substitute another version. */
export async function planRuntimePackages(
  root: string,
  roots: RuntimePackage[],
  locate: (name: string, from: string) => Promise<RuntimePackage>,
): Promise<RuntimePackageNode[]> {
  const top = new Map<string, RuntimePackageNode>();
  for (const pkg of roots) {
    if (top.has(pkg.json.name) && top.get(pkg.json.name)!.pkg.directory !== pkg.directory)
      throw Error("RUNTIME_ROOT_VERSION_CONFLICT");
    top.set(pkg.json.name, { pkg, target: join(root, "node_modules", pkg.json.name) });
  }
  const result: RuntimePackageNode[] = [],
    targets = new Set<string>();
  const visit = async (node: RuntimePackageNode, contexts: Map<string, RuntimePackageNode>[]) => {
    if (targets.has(node.target)) return;
    targets.add(node.target);
    result.push(node);
    if (result.length > 5000) throw Error("RUNTIME_DEPENDENCY_GRAPH_BOUND");
    const children = new Map<string, RuntimePackageNode>(),
      created: RuntimePackageNode[] = [];
    for (const name of Object.keys(node.pkg.json.dependencies ?? {})) {
      const pkg = await locate(name, node.pkg.directory);
      let existing: RuntimePackageNode | undefined;
      for (const context of contexts) {
        existing = context.get(name);
        if (existing) break;
      }
      if (existing?.pkg.directory === pkg.directory) children.set(name, existing);
      else {
        const child = { pkg, target: join(node.target, "node_modules", name) };
        children.set(name, child);
        created.push(child);
      }
    }
    for (const child of created) await visit(child, [children, ...contexts]);
  };
  for (const node of top.values()) await visit(node, [top]);
  return result;
}
