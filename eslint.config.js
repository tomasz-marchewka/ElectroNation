import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "prototyp/",
      "design_handoff_electronation_turn_ui/",
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
);
