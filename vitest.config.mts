import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "data/**/*.test.ts", "components/**/*.test.tsx"],
    testTimeout: 30000,
    // The integration test writes to the real dev.db; running files in
    // parallel would interleave runs and make row counts non-deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "test/server-only-stub.ts"),
    },
  },
});
