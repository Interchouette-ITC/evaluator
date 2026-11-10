/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libs/util/functions",
  plugins: [nxCopyAssetsPlugin(["*.md"])],
  test: {
    name: "util-functions",
    watch: false,
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libs/util/functions",
      provider: "v8" as const,
    },
  },
}));
