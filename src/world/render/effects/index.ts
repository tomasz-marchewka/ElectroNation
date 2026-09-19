// render/effects — stub until the module's builder lands it (ARCHITECTURE.md §18).
// The registry treats a stub like any module: init, update and frame run and
// do nothing, so the world boots with the module absent rather than broken.

import type { WorldModule } from "../core/types";

export function createEffectsModule(): WorldModule {
  return {
    id: "effects",
    init() {},
    update() {},
    frame() {},
    dispose() {},
  };
}
