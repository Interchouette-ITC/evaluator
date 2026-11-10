/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import { nxReadySignal } from "@nx/vite/plugins/nx-ready-signal.plugin";

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/evaluator-backend",
  plugins: [nxCopyAssetsPlugin(["*.md"]), nxReadySignal()],
  test: {
    name: "evaluator-backend",
    watch: false,
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/evaluator-backend",
      provider: "v8" as const,
    },
  },
}));
