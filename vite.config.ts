/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the build from a repo subpath; dev and e2e stay at root.
  base: command === "build" ? "/ElectroNation/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // three.js is the one large dependency; kept apart from the game so a
        // game change never invalidates the cached renderer chunk (Vite 8 runs
        // on rolldown, whose chunking API is `advancedChunks`).
        advancedChunks: { groups: [{ name: "three", test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
    chunkSizeWarningLimit: 1_200,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "stats",
          include: ["tests/stats/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "goldens",
          include: ["tests/goldens/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/components/setup.ts"],
          environment: "jsdom",
        },
      },
    ],
  },
}));
