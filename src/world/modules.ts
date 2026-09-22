// The module roster (ARCHITECTURE.md §11): every render module by id, in the
// order the registry initialises them — terrain and sky first, because they
// register the providers the rest read. A builder never edits this file: each
// folder's index.ts exports its factory, and a stub stands in until then.

import { createBoardOutlineModule } from "./render/core/BoardOutline";
import type { WorldModule } from "./render/core/types";
import { createCitiesModule } from "./render/cities";
import { createEffectsModule } from "./render/effects";
import { createGridModule } from "./render/grid";
import { createNodesModule } from "./render/nodes";
import { createPlantsModule } from "./render/plants";
import { createResModule } from "./render/res";
import { createSkyModule } from "./render/sky";
import { createStorageModule } from "./render/storage";
import { createTerrainModule } from "./render/terrain";

export type ModuleFactory = () => WorldModule;

export const MODULE_FACTORIES: Record<string, ModuleFactory> = {
  terrain: createTerrainModule,
  sky: createSkyModule,
  board: createBoardOutlineModule,
  grid: createGridModule,
  plants: createPlantsModule,
  res: createResModule,
  storage: createStorageModule,
  nodes: createNodesModule,
  cities: createCitiesModule,
  effects: createEffectsModule,
};

/** Init order: providers first, overlays last. */
export const MODULE_ORDER = [
  "terrain",
  "sky",
  "board",
  "grid",
  "plants",
  "res",
  "storage",
  "nodes",
  "cities",
  "effects",
] as const;

/** Instances for the whole game, or for the subset a showcase names. */
export function worldModules(ids?: readonly string[]): WorldModule[] {
  const wanted = ids ? new Set([...ids, "board"]) : null;
  return MODULE_ORDER.filter((id) => wanted === null || wanted.has(id)).map((id) => {
    const factory = MODULE_FACTORIES[id];
    if (!factory) throw new Error(`unknown world module: ${id}`);
    return factory();
  });
}
