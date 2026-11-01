/** Reference build reserves independent headroom on the host and Docker's data filesystem. */
export function storageBlockers(hostFreeBytes: unknown, dockerFreeBytes: unknown): string[] {
  const enough = (bytes: unknown, minimum: number) =>
    typeof bytes === "number" && Number.isFinite(bytes) && bytes >= minimum;
  const blockers: string[] = [];
  if (!enough(hostFreeBytes, 8 * 1024 ** 3)) blockers.push("BUILD_DISK_SPACE_REQUIRED");
  if (!enough(dockerFreeBytes, 6 * 1024 ** 3)) blockers.push("DOCKER_DISK_SPACE_REQUIRED");
  return blockers;
}
