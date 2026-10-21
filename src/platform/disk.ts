import { statfs } from "node:fs/promises";
export async function enoughDisk(path: string, minBytes = 10 * 1024 ** 3) {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize >= minBytes;
}
