import { dirname, relative, resolve } from "node:path";
import { SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
/** Installed TypeScript 7 API adapter. Keep unstable AST/client details out of the policy checker. */
export function architectureImports(root) {
  const api = new API({ cwd: root });
  let snapshot;
  try {
    const config = resolve(root, "tsconfig.json");
    snapshot = api.updateSnapshot({ openProjects: [config] });
    const project = snapshot.getProject(config) ?? snapshot.getProjects()[0];
    if (!project) throw Error("ARCHITECTURE_PROJECT_UNAVAILABLE");
    const files = project.program
      .getSourceFileNames()
      .filter((f) => !relative(root, f).startsWith("..") && !f.includes("/node_modules/") && /\.[cm]?[jt]sx?$/.test(f));
    const edges = [];
    for (const file of files) {
      const source = project.program.getSourceFile(file);
      if (!source) throw Error("ARCHITECTURE_SOURCE_UNAVAILABLE");
      const take = (node, typeOnly = false) => {
        if (!node) return;
        const text = node.text;
        if (
          (node.kind !== SyntaxKind.StringLiteral && node.kind !== SyntaxKind.NoSubstitutionTemplateLiteral) ||
          typeof text !== "string"
        ) {
          edges.push({ from: relative(root, file).replaceAll("\\", "/"), specifier: null, target: null });
          return;
        }
        const symbol = project.checker.getSymbolAtLocation(node),
          path = symbol?.declarations[0]?.path,
          // Node handles use canonical (case-folded) paths on macOS. Resolve
          // the original source name before comparing repository-relative paths.
          targetFile = path ? (project.program.getSourceFile(String(path))?.fileName ?? String(path)) : null;
        const fallback = text.startsWith(".") ? resolve(dirname(file), text).replace(/\.js$/, ".ts") : null;
        edges.push({
          from: relative(root, file).replaceAll("\\", "/"),
          specifier: text,
          typeOnly,
          target: targetFile
            ? relative(root, targetFile).replaceAll("\\", "/")
            : fallback
              ? relative(root, fallback).replaceAll("\\", "/")
              : null,
        });
      };
      const visit = (node) => {
        if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) {
          if (node.moduleSpecifier)
            take(
              node.moduleSpecifier,
              Boolean(
                node.isTypeOnly ||
                  node.importClause?.isTypeOnly ||
                  (node.importClause?.namedBindings?.elements?.length &&
                    node.importClause.namedBindings.elements.every((e) => e.isTypeOnly)),
              ),
            );
        } else if (node.kind === SyntaxKind.ImportType) {
          take(node.argument?.literal, true);
        } else if (
          node.kind === SyntaxKind.CallExpression &&
          (node.expression.kind === SyntaxKind.ImportKeyword || node.expression.text === "require")
        )
          take(node.arguments?.[0]);
        node.forEachChild(visit);
      };
      visit(source);
    }
    return edges;
  } finally {
    snapshot?.dispose();
    api.close();
  }
}
