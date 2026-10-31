import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/config/research", { recursive: true });
await copyFile("config/research/metrics.v1.json", "dist/config/research/metrics.v1.json");
