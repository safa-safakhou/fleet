import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
