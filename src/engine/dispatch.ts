// Block dynamics (01 §5.1 in 0.27, 02 §4 step 2): a plant's setpoint is an
// ORDER, executed by its blocks with the inertia of their technology. Each
// resolution advances every block one turn — start orders, startup counters,
// ramps, technical minimum — and the sum of block outputs is what the plant
// offers to the flow. Pure functions over plant state; no PRNG anywhere.

import { PLANT_DYNAMICS, type PlantDynamicsSpec, type PlantTech } from "./config";
import { quantize001 } from "./quantize";
import { COLD_OFFLINE_TURNS, type PlantBlockState, type PlantState } from "./state";

/** Float guard for MW comparisons; state MW are quantized to 0.01 anyway. */
const EPS = 1e-6;

/** A freshly built block: cold, offline, producing nothing (01 §5.1 pt 2). */
export function newBlock(mw: number): PlantBlockState {
  return {
    mw,
    status: "offline",
    outputMw: 0,
    startupTurnsLeft: 0,
    offlineTurns: COLD_OFFLINE_TURNS,
  };
}

/**
 * `count` cold blocks splitting `capacityMw` evenly — scenario endowments and
 * the 14 → 15 migration know only the plant total and its block count. Each
 * block is quantized to 0.01 MW; the last takes the remainder, so the sum is
 * exactly the plant's capacity.
 */
export function evenBlocks(capacityMw: number, count: number): PlantBlockState[] {
  const blocks: PlantBlockState[] = [];
  const share = quantize001(capacityMw / count);
  for (let i = 0; i < count - 1; i++) blocks.push(newBlock(share));
  blocks.push(newBlock(quantize001(capacityMw - share * (count - 1))));
  return blocks;
}

/** Whether the next start order would be warm (01 §5.1 pt 2). */
export function isBlockWarm(block: PlantBlockState, dynamics: PlantDynamicsSpec): boolean {
  return block.offlineTurns <= dynamics.warmWindowTurns;
}

/**
 * Commitment preference (01 §5.1 pt 1): keep what already runs, then what is
 * already starting, then warm blocks, cold last; ties resolve by block index so
 * the choice is replay-stable.
 */
function commitmentRank(block: PlantBlockState, dynamics: PlantDynamicsSpec): number {
  if (block.status === "online") return 0;
  if (block.status === "starting") return 1;
  return isBlockWarm(block, dynamics) ? 2 : 3;
}

/**
 * Which blocks the setpoint commits: walk in preference order, committing until
 * the rated power of the committed set covers the order (01 §5.1 pt 1). Blocks
 * beyond that are shut down.
 */
function desiredBlocks(
  blocks: readonly PlantBlockState[],
  targetMw: number,
  dynamics: PlantDynamicsSpec,
): boolean[] {
  const order = blocks
    .map((block, index) => ({ block, index }))
    .sort(
      (a, b) =>
        commitmentRank(a.block, dynamics) - commitmentRank(b.block, dynamics) || a.index - b.index,
    );
  const desired = blocks.map(() => false);
  let committedMw = 0;
  for (const { block, index } of order) {
    if (committedMw >= targetMw - EPS) break;
    desired[index] = true;
    committedMw += block.mw;
  }
  return desired;
}

/**
 * Greedy allocation among producing blocks (01 §5.1 pt 5): every block gets its
 * minimum first, then blocks are topped up to rated power in index order until
 * the order is covered. Deterministic; variable cost is shared per technology,
 * so the split never changes the fuel bill.
 */
function allocateTargets(
  blocks: readonly (PlantBlockState | null)[],
  targetMw: number,
  dynamics: PlantDynamicsSpec,
): number[] {
  const targets = blocks.map((block) => (block ? dynamics.minLoadShare * block.mw : 0));
  let remaining = targetMw - targets.reduce((sum, mw) => sum + mw, 0);
  for (let i = 0; i < blocks.length && remaining > EPS; i++) {
    const block = blocks[i];
    if (!block) continue;
    const headroom = block.mw - (targets[i] ?? 0);
    const add = Math.min(headroom, remaining);
    targets[i] = (targets[i] ?? 0) + add;
    remaining -= add;
  }
  return targets;
}

export interface DispatchAdvance {
  plant: PlantState;
  /** Unweighted PLN of the start orders issued by this advance. */
  startupCostPln: number;
}

/**
 * One resolution of a plant's block dynamics (02 §4 step 2). Returns the plant
 * with blocks advanced by one turn toward the setpoint and the startup cost of
 * every start order this advance issued (charged at the order — 01 §5.1 pt 3).
 */
export function advancePlantDispatch(plant: PlantState): DispatchAdvance {
  const dynamics = PLANT_DYNAMICS[plant.tech];
  const targetMw = Math.min(Math.max(0, plant.setpointMw), plant.capacityMw);
  const desired = desiredBlocks(plant.blocks, targetMw, dynamics);
  let startupCostPln = 0;

  // Pass 1 — statuses: start orders, startup countdowns, cancellations. Where a
  // block ends up producing this turn, the slot holds its pre-ramp output base.
  const advanced: PlantBlockState[] = [];
  // Producing blocks, aligned by index; `pinned` = arrived from a counted
  // startup this turn, held at minimum with no ramp step (01 §5.1 pt 2).
  const producing: (PlantBlockState | null)[] = [];
  const pinned: boolean[] = [];
  for (const [index, block] of plant.blocks.entries()) {
    let next = block;
    if (desired[index]) {
      if (next.status === "offline") {
        const turns = isBlockWarm(next, dynamics)
          ? dynamics.startupWarmTurns
          : dynamics.startupColdTurns;
        startupCostPln += dynamics.startupCostPlnPerMw * next.mw;
        next = { ...next, status: "starting", startupTurnsLeft: turns };
      }
      if (next.status === "starting") {
        const counted = next.startupTurnsLeft > 0;
        const left = Math.max(0, next.startupTurnsLeft - 1);
        if (left > 0) {
          next = { ...next, startupTurnsLeft: left, offlineTurns: bumpOffline(next.offlineTurns) };
          advanced.push(next);
          producing.push(null);
          pinned.push(false);
          continue;
        }
        // Arrives at minimum load; a zero-turn startup ramps on this very turn.
        next = {
          ...next,
          status: "online",
          startupTurnsLeft: 0,
          offlineTurns: 0,
          outputMw: quantize001(dynamics.minLoadShare * next.mw),
        };
        advanced.push(next);
        producing.push(next);
        pinned.push(counted);
        continue;
      }
      // Already online: ramps toward its allocation in pass 2.
      advanced.push(next);
      producing.push(next);
      pinned.push(false);
    } else {
      if (next.status === "starting") {
        // Cancelled start — the cost is sunk, the block never got hot.
        next = {
          ...next,
          status: "offline",
          startupTurnsLeft: 0,
          offlineTurns: bumpOffline(next.offlineTurns),
        };
        advanced.push(next);
      } else if (next.status === "online") {
        // Shutdown: ramp down; below minimum the block trips to zero.
        const floor = dynamics.minLoadShare * next.mw;
        const rampedDown = next.outputMw - dynamics.rampDownSharePerTurn * next.mw;
        next =
          rampedDown < floor - EPS
            ? { ...next, status: "offline", outputMw: 0, offlineTurns: 0 }
            : { ...next, outputMw: quantize001(rampedDown) };
        advanced.push(next);
      } else {
        next = { ...next, offlineTurns: bumpOffline(next.offlineTurns) };
        advanced.push(next);
      }
      producing.push(null);
      pinned.push(false);
    }
  }

  // Pass 2 — outputs: allocate the order among producing blocks, then move each
  // one toward its share within its ramp and above its minimum.
  const targets = allocateTargets(producing, targetMw, dynamics);
  for (let i = 0; i < advanced.length; i++) {
    const block = advanced[i]!;
    if (!producing[i] || pinned[i]) continue;
    const floor = dynamics.minLoadShare * block.mw;
    const blockTarget = Math.min(block.mw, Math.max(floor, targets[i] ?? 0));
    const rampMw =
      blockTarget >= block.outputMw
        ? dynamics.rampUpSharePerTurn * block.mw
        : dynamics.rampDownSharePerTurn * block.mw;
    const step = Math.min(Math.abs(blockTarget - block.outputMw), rampMw);
    const moved = block.outputMw + Math.sign(blockTarget - block.outputMw) * step;
    advanced[i] = { ...block, outputMw: quantize001(Math.min(block.mw, Math.max(floor, moved))) };
  }

  return { plant: { ...plant, blocks: advanced }, startupCostPln };
}

function bumpOffline(offlineTurns: number): number {
  return Math.min(offlineTurns + 1, COLD_OFFLINE_TURNS);
}

/**
 * Blocks as if the plant had held `setpointMw` since forever: the committed set
 * online at its allocation, the rest cold. The 14 → 15 migration seeds a
 * running plant with this instead of imposing a fake cold start on a save
 * written when setpoints acted instantly.
 */
export function settledBlocks(
  tech: PlantTech,
  capacityMw: number,
  count: number,
  setpointMw: number,
): PlantBlockState[] {
  const dynamics = PLANT_DYNAMICS[tech];
  const blocks = evenBlocks(capacityMw, count);
  const targetMw = Math.min(Math.max(0, setpointMw), capacityMw);
  if (targetMw <= 0) return blocks;
  const desired = desiredBlocks(blocks, targetMw, dynamics);
  const targets = allocateTargets(
    blocks.map((block, i) => (desired[i] ? block : null)),
    targetMw,
    dynamics,
  );
  return blocks.map((block, i) => {
    if (!desired[i]) return block;
    const floor = dynamics.minLoadShare * block.mw;
    return {
      ...block,
      status: "online" as const,
      offlineTurns: 0,
      outputMw: quantize001(Math.min(block.mw, Math.max(floor, targets[i] ?? 0))),
    };
  });
}

/**
 * Deterministic look-ahead for the plan projections (01 §8 pt 2–3): the output
 * the plant would hold `stepsAhead` resolutions from now if the setpoint stayed
 * where it is. Step 1 is the pending turn. Dynamics carry no randomness, so
 * this is exact, not a forecast.
 */
export function projectPlantOutputMw(plant: PlantState, stepsAhead: number): number {
  let current = plant;
  for (let step = 0; step < stepsAhead; step++) {
    current = advancePlantDispatch(current).plant;
  }
  let sum = 0;
  for (const block of current.blocks) sum += block.outputMw;
  return sum;
}
