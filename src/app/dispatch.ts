// Dispatch figures every screen derives the same way, so the panel, the SVG
// map and the 3D world never disagree on a number the engine does not store.

import type { PlantState } from "../engine";

/**
 * The plant's standing order [MW] (01 §5.1, 0.28): under automatic control
 * the plant-level setpoint; under manual control that setpoint is dormant and
 * the order is the sum of the block orders.
 */
export function plantOrderMw(plant: PlantState): number {
  if (plant.controlMode === "auto") return plant.setpointMw;
  let sum = 0;
  for (const block of plant.blocks) sum += block.setpointMw;
  return sum;
}
