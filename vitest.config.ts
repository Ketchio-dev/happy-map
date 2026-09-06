import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  resolve: { alias: { "@": `${here}src`, "server-only": `${here}tests/server-only.ts` } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 90_000, hookTimeout: 90_000 },
});
