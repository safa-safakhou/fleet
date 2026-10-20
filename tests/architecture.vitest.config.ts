import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mergeConfig } from "vitest/config";

const base = process.env.FLEET_ARCHITECTURE_BASE_CONFIG;
if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !base) throw Error("OWNED_FIXTURE_CONFIG_REQUIRED");
const configuration = await import(pathToFileURL(base).href);
export default mergeConfig(configuration.default, {
  test: {
    setupFiles: [resolve(dirname(fileURLToPath(import.meta.url)), "architecture-fixture.ts")],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
