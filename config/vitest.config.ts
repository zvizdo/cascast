import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    include: ["{src/app,src/lib,src/components,src/data}/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/*.emulator.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/app/api/**", "src/lib/**", "src/components/**"],
      // WebGL/R3F and MapLibre components are un-mountable in jsdom; logic lives in tested pure modules.
      exclude: ["src/components/three/**", "src/components/map/**"],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../tests/server-only-stub.ts", import.meta.url)),
    },
  },
});
