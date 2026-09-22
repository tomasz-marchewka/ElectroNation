import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Import patterns that would breach the world's seams (ARCHITECTURE.md §2). */
const ENGINE_IMPORT = {
  group: ["**/engine/**", "**/engine"],
  message: "the world reads the scene contract, never the engine (ARCHITECTURE.md §2)",
};
const APP_IMPORT = {
  group: ["**/app/**"],
  message: "render modules never import the app layer — ask the bridge (ARCHITECTURE.md §2)",
};
const BRIDGE_BUILDERS_IMPORT = {
  // Everything under bridge/ but the type file — including the directory index.
  regex: "(^|/)bridge(/(?!worldScene$)[^/]+)?$",
  message: "render modules import only bridge/worldScene — the types (ARCHITECTURE.md §2)",
};

/** Non-deterministic sources a world frame may never read (ARCHITECTURE.md §12). */
const NONDETERMINISM = [
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: "use ctx.rng(<stream>) — Math.random breaks frame determinism (ARCHITECTURE.md §12)",
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message: "read the frame clock, never Date (ARCHITECTURE.md §12)",
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "read the frame clock, never Date.now (ARCHITECTURE.md §12)",
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "captures/",
      "prototyp/",
      // Scratch git worktrees: a second checkout of this very source, whose
      // tsconfigs leave the type-aware parser with no single root directory.
      ".claude/worktrees/",
      // Delivered handoff — an external artifact, kept byte for byte.
      "design_handoff_electronation_design_system/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Engine wall: pure, isomorphic simulation — no browser APIs, no Node
    // APIs, no UI imports. The hard wall is tsconfig.engine.json (no DOM lib);
    // these rules are the redundant fence with better error messages.
    files: ["src/engine/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "localStorage",
        "sessionStorage",
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "requestAnimationFrame",
        "performance",
        "setTimeout",
        "setInterval",
        "queueMicrotask",
        "structuredClone",
        "crypto",
        "process",
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "zustand", "*.css"],
              message: "engine must not depend on UI libraries",
            },
            {
              group: ["node:*"],
              message: "engine must stay isomorphic (browser + future server)",
            },
            {
              group: ["**/app/**"],
              message: "engine must not import from src/app",
            },
          ],
        },
      ],
    },
  },
  {
    // World wall (ARCHITECTURE.md §2): render modules, interaction, perf and
    // the showcase registry see the scene contract and three — nothing else.
    files: [
      "src/world/render/**",
      "src/world/interaction/**",
      "src/world/perf/**",
      "src/world/showcase/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [ENGINE_IMPORT, APP_IMPORT, BRIDGE_BUILDERS_IMPORT] },
      ],
      "no-restricted-syntax": ["error", ...NONDETERMINISM],
    },
  },
  {
    // Node scripts of the capture harness: Node globals plus the browser ones
    // used inside page.evaluate callbacks.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        window: "readonly",
      },
    },
  },
  {
    // The HUD reads view models through the bridge, never the engine.
    files: ["src/world/hud/**", "src/world/capture/**", "src/world/WorldView.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [ENGINE_IMPORT] }],
    },
  },
);
