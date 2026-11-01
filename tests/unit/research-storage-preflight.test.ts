import { expect, test } from "vitest";
import { storageBlockers } from "../../src/research/qualification/storage.js";

const GiB = 1024 ** 3;
test("host and Docker storage need independent headroom, including exact boundaries", () => {
  expect(storageBlockers(8 * GiB, 6 * GiB)).toEqual([]);
  expect(storageBlockers(8 * GiB - 1, 20 * GiB)).toEqual(["BUILD_DISK_SPACE_REQUIRED"]);
  expect(storageBlockers(20 * GiB, 6 * GiB - 1)).toEqual(["DOCKER_DISK_SPACE_REQUIRED"]);
});
test("missing, nonfinite or invalid storage measurements never allow an image build", () => {
  for (const n of [NaN, Infinity, -1, null, undefined])
    expect(storageBlockers(n as number, 20 * GiB)).toContain("BUILD_DISK_SPACE_REQUIRED");
  for (const n of [NaN, Infinity, -1, null, undefined])
    expect(storageBlockers(20 * GiB, n as number)).toContain("DOCKER_DISK_SPACE_REQUIRED");
});
