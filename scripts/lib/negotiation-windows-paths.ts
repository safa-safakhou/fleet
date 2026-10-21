import { win32 as path } from "node:path";
export function windowsInspectionEnvironment(parent: NodeJS.ProcessEnv) {
  return Object.fromEntries(Object.entries(parent).filter(([key]) => key.toLowerCase() !== "psmodulepath"));
}
export function validateWindowsProviderStore(base: string, root: string, canonicalBase: string, canonicalRoot: string) {
  const r = path.relative(path.join(base, "provider-stores"), path.resolve(root));
  if (
    !/^[a-f0-9-]{36}$/i.test(r) ||
    path.resolve(canonicalRoot).toLowerCase() !== path.join(canonicalBase, "provider-stores", r).toLowerCase()
  )
    throw Error("OWNED_PROVIDER_STORE_REQUIRED");
}
/** Windows app-container redirection applies to the base, not permission to
 * redirect a bundle or private child outside that same canonical base. */
export function validateWindowsOwnedRoots(
  base: string,
  bundle: string,
  root: string,
  canonicalBase: string,
  canonicalBundle: string,
  canonicalRoot: string,
) {
  const b = path.relative(path.join(base, "bundles"), path.resolve(bundle)),
    r = path.relative(base, path.resolve(root));
  if (
    !/^[a-f0-9-]{36}$/i.test(b) ||
    !/^(?:E[1-4]|KQ1)\\[a-f0-9-]{36}$/i.test(r) ||
    path.resolve(canonicalBundle).toLowerCase() !== path.join(canonicalBase, "bundles", b).toLowerCase() ||
    path.resolve(canonicalRoot).toLowerCase() !== path.join(canonicalBase, r).toLowerCase()
  )
    throw Error("OWNED_PRIVATE_PATH_REQUIRED");
}
