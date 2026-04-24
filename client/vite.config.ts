import { defineConfig } from "vite";

const sharedSourcePath = decodeURIComponent(
  new URL("../shared/src/index.ts", import.meta.url).pathname
);

export default defineConfig({
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  },
  build: {
    outDir: "dist",
    sourcemap: false
  },
  resolve: {
    alias: {
      "@wuland/shared": sharedSourcePath
    },
    dedupe: ["phaser"]
  }
});
