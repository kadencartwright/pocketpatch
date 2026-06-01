import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "vendor/**", "dist/**"],
    include: [
      "apps/web/src/**/*.test.ts",
      "packages/{cli,config,daemon,git,network,storage}/test/**/*.test.ts",
    ],
  },
});
