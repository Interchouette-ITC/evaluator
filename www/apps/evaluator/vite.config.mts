import { defineConfig } from "vitest/config";
import angular from "@analogjs/vite-plugin-angular";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import { nxReadySignal } from "@nx/vite/plugins/nx-ready-signal.plugin";

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/evaluator",
  plugins: [angular(), nxCopyAssetsPlugin(["*.md"]), nxReadySignal()],
  test: {
    name: "evaluator",
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/evaluator",
      provider: "v8" as const,
    },
  },
}));
