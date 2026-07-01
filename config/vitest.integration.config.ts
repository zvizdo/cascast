import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Integration config: includes the emulator-backed test that the default
// config excludes. Runs only via `npm run test:integration` (live emulator).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    include: ["**/*.emulator.test.ts"],
    exclude: [...configDefaults.exclude],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../tests/server-only-stub.ts", import.meta.url)),
    },
  },
});
