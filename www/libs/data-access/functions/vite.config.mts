/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libs/data-access/functions",
  plugins: [angular(), nxCopyAssetsPlugin(["*.md"])],
  test: {
    name: "data-access-functions",
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libs/data-access/functions",
      provider: "v8" as const,
    },
  },
}));
