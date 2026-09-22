// render/effects — the dispatcher's overlay (docs/08 §3, ARCHITECTURE.md §18).
//
// Everything this module draws is a *diagnosis* of state another module
// already renders: the selected and hovered hex, the route preview, the worst
// bottleneck, a city in deficit, a curtailed or disabled farm, a dumping
// plant, a charging battery, an importing border, a line under construction.
// It owns no state of its own and reads the hooks the other modules publish
// (docs/STATUS.json effectsHooks) plus its own scene slice — nothing else.
//
// Two shared band passes carry every ground mark (one normal-blended with a
// dark underlay, one additive for the night twin), one instanced pass carries
// every flow dash, one every storage chevron, four every tower crane. All the
// state is encoded per docs/08 §3: colour codes the state, the silhouette and
// the motion carry the rest, every animated signal has a static twin, and the
// hues are the grid's hue-stable-over-ACES radiances.

import * as THREE from "three";
import type { HexRef, WorldScene } from "../../bridge/worldScene";
import { HEIGHT_KM } from "../core/exaggeration";
import { hash01 } from "../core/prng";
import { QUALITY_PROFILES } from "../core/Quality";
import type { ModuleContext, WorldModule } from "../core/types";
import { hexToWorld, HEX_RADIUS_KM, type GroundPoint } from "../core/units";
import { BandBatch } from "./bands";
import {
  BAND_LIFT_KM,
  chevronGeometry,
  conformSpine,
  resampleByArc,
  craneHookGeometry,
  craneMastGeometry,
  craneRopeGeometry,
  craneSlewGeometry,
  dashQuadGeometry,
  hexSpine,
  postGeometry,
  ringSpine,
} from "./geometry";
import {
  buildHookIndex,
  readEffectsState,
  type EffectsState,
  type FlowMark,
  type HookIndex,
} from "./hooks";
import {
  BandUniforms,
  createBandGlowMaterial,
  createBandSolidMaterial,
  createCraneMaterials,
  createDashMaterial,
  createUnlitMaterial,
  EFFECT_COLORS,
  type CraneMaterials,
  type DashUniforms,
} from "./materials";

const DEG = Math.PI / 180;

/** Dash capacity of the flow pass; the density knob trims below this. */
const MAX_DASHES = 512;

/** Length of one dash's travel unit along a conductor [km] — one hex. */
const DASH_STEP_KM = 25;

/** Load palette for the dashes — the same radiances as the conductors. */
const DASH_COLOR: Record<FlowMark["load"], readonly [number, number, number]> = {
  ok: [0.5, 0.46, 0.4],
  warn: [1.1, 0.27, 0.01],
  over: [1.15, 0.03, 0.02],
};
const DASH_ALPHA: Record<FlowMark["load"], number> = { ok: 0.5, warn: 0.72, over: 0.76 };

/** Route ribbon half width by line type [km] — width codes the type, the SVG's own rule. */
const ROUTE_HALF_KM = { lv: 0.3, mv: 0.5, hv: 0.75 } as const;

/** Alarm breath amplitude (docs/08 §4: 30 %). */
const PULSE_AMPLITUDE = 0.3;

/**
 * Screen-space ceilings for ground rings [px of radius at the camera's
 * distance]. A hex ring is sized for the strategic view; without the ceiling
 * an 11 km circle swallows an 18 km detail frame and buries the very line it
 * marks (critic finding, audit-bess-discharge). Status rings get a looser
 * ceiling: they only cap when they would dominate.
 */
const BOTTLENECK_RING_PX = 44;
const BOTTLENECK_GLOW_PX = 62;
const STATUS_RING_PX = 80;

/** Segment-end bracket: half length of the crossbar, and the second bar's gap [km]. */
const END_BAR_HALF_KM = 1.6;
const END_BAR_GAP_KM = 0.9;
/**
 * Screen-space ceilings for the bottleneck corridor [px half-width]: the
 * conductor already glows red under an overload, so the diagnostic band must
 * stay a thin accent at close range instead of washing the frame.
 */
const BOTTLENECK_BAND_PX = 5;
const BOTTLENECK_BAND_GLOW_PX = 12;

/** Crane slew rate [rad/s] and the offset from the hook's own anchor [km]. */
const CRANE_SLEW_RAD_S = 0.045;
const CRANE_OFFSET_KM = 6.2;
/** Screen-space silhouette floor for a crane mast [px] and the scale cap. */
const CRANE_MIN_PX = 7;
const CRANE_MAX_SCALE = 4;

/**
 * Dump arrows: instanced chevrons pointing down into the ground. There is no
 * ground ring: amber belongs to warn lines and curtailed farms, so the surplus
 * is carried by the silhouette alone (critic finding, s3). The arrow keeps a
 * screen-space size floor — like the crane lamp — or the strategic view would
 * lose the only mark the surplus has left, and the lift follows the size so
 * the head stays near the ground plane.
 */
const DUMP_CAPACITY = 8;
const DUMP_ARROW_KM = 1.1;
const DUMP_ARROW_LIFT_KM = 2.0;
const DUMP_ARROW_MIN_PX = 18;
const DUMP_ARROW_MAX_KM = 13;
/** Dark twin scale under the pale chevron — the band passes' rim, as a prop. */
const DUMP_ARROW_UNDER_SCALE = 1.9;

const HEX_CORNER_CACHE = new Map<string, GroundPoint[]>();

/** Mean magnitude of the arrows pointing one way — drives the material opacity. */
function magnitudeOf(
  specs: readonly { direction: 1 | -1; magnitude: number }[],
  direction: 1 | -1,
): number {
  let sum = 0;
  let count = 0;
  for (const spec of specs) {
    if (spec.direction !== direction) continue;
    sum += spec.magnitude;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/** Instanced capacities: waypoints per route preview and storage chevrons. */
const POST_CAPACITY = 24;
const ARROW_CAPACITY = 32;

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const _axisX = new THREE.Vector3();
const _axisY = new THREE.Vector3();
const _axisZ = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The worst bottleneck of the shown turn (docs/08 §3: "the one worst
 * bottleneck gets a red ground ring"). `overlay.bottleneck` is the
 * interface-requested one and always wins; this derivation only keeps the
 * world honest when the player has not clicked the alert.
 */
function worstBottleneck(
  effects: EffectsState,
): { hexes: HexRef[]; spine: THREE.Vector3[] } | null {
  let best: FlowMark | null = null;
  for (const flow of effects.flows) {
    if (flow.load === "ok") continue;
    if (!best) {
      best = flow;
      continue;
    }
    // Highest ratio wins; a tie at the limit goes to the segment moving the
    // most power — the biggest absolute overload of the shown turn.
    if (flow.ratio > best.ratio + 1e-6) best = flow;
    else if (Math.abs(flow.ratio - best.ratio) <= 1e-6 && flow.usedMw > best.usedMw) best = flow;
  }
  if (!best) return null;
  return { hexes: best.pathHexes, spine: best.spine };
}

/** The grid's own spine of a segment, when it published one this turn. */
function fineGridSpine(effects: EffectsState, segmentKey: string): THREE.Vector3[] | null {
  for (const flow of effects.flows) if (flow.key === segmentKey) return flow.spine;
  return null;
}

/** Arc-length midpoint of a ground polyline — where the stretch ring sits. */
function midpointOf(points: readonly GroundPoint[]): GroundPoint | null {
  const first = points[0];
  if (!first) return null;
  if (points.length === 1) return { x: first.x, z: first.z };
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length <= 1e-6) continue;
    if (remaining <= length) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= length;
  }
  const last = points[points.length - 1] ?? first;
  return { x: last.x, z: last.z };
}

function ringOf(centre: { x: number; z: number }, radiusKm: number, segments = 48): GroundPoint[] {
  const key = `${centre.x.toFixed(2)}:${centre.z.toFixed(2)}:${radiusKm.toFixed(2)}:${segments}`;
  const cached = HEX_CORNER_CACHE.get(key);
  if (cached) return cached;
  const points = ringSpine(centre, radiusKm, segments);
  if (HEX_CORNER_CACHE.size > 512) HEX_CORNER_CACHE.clear();
  HEX_CORNER_CACHE.set(key, points);
  return points;
}

export function createEffectsModule(): WorldModule {
  let ctxRef: ModuleContext | null = null;

  const bandUniforms = new BandUniforms();
  const dashUniforms: DashUniforms = { uTime: { value: 0 }, uPxKm: { value: 0.001 } };

  let solid: THREE.MeshBasicMaterial | null = null;
  let glow: THREE.MeshBasicMaterial | null = null;
  let dashMaterial: THREE.ShaderMaterial | null = null;
  let dashUnderMaterial: THREE.ShaderMaterial | null = null;
  let chargeMaterial: THREE.MeshBasicMaterial | null = null;
  let dischargeMaterial: THREE.MeshBasicMaterial | null = null;
  let postMaterial: THREE.MeshBasicMaterial | null = null;
  let craneMaterials: CraneMaterials | null = null;

  let stateBands: BandBatch | null = null;
  let stateGlow: BandBatch | null = null;
  let overlayBands: BandBatch | null = null;
  let overlayGlow: BandBatch | null = null;

  let dashMesh: THREE.InstancedMesh | null = null;
  let dashUnderMesh: THREE.InstancedMesh | null = null;
  let dashGeometry: THREE.BufferGeometry | null = null;
  let chargeArrows: THREE.InstancedMesh | null = null;
  let dischargeArrows: THREE.InstancedMesh | null = null;
  let arrowGeometry: THREE.BufferGeometry | null = null;
  let dumpArrows: THREE.InstancedMesh | null = null;
  let dumpUnderArrows: THREE.InstancedMesh | null = null;
  let dumpMaterial: THREE.MeshBasicMaterial | null = null;
  let dumpUnderMaterial: THREE.MeshBasicMaterial | null = null;
  let posts: THREE.InstancedMesh | null = null;
  let postGeometryCache: THREE.BufferGeometry | null = null;

  let craneParts: {
    mast: THREE.InstancedMesh;
    slew: THREE.InstancedMesh;
    rope: THREE.InstancedMesh;
    hook: THREE.InstancedMesh;
    lamp: THREE.InstancedMesh;
  } | null = null;
  const craneGeometries: THREE.BufferGeometry[] = [];
  let craneCapacity = 0;
  let lampMaterial: THREE.MeshBasicMaterial | null = null;

  let hooks: HookIndex | null = null;
  let hookKey = "";
  let stateKey = "";
  let overlayKey = "";
  let ambientTime = 0;
  let flowTime = 0;
  let cranes: { x: number; y: number; z: number; yaw: number; phase: number }[] = [];
  let arrowsSpec: {
    x: number;
    z: number;
    baseY: number;
    angle: number;
    direction: 1 | -1;
    magnitude: number;
  }[] = [];
  let arrowTime = 0;
  let dumpSpec: { x: number; z: number }[] = [];

  const ensureResources = (ctx: ModuleContext): void => {
    if (stateBands) return;
    bandUniforms.sync(0, 0.001, 0, 1);
    solid = createBandSolidMaterial(bandUniforms);
    glow = createBandGlowMaterial(bandUniforms);
    dashMaterial = createDashMaterial(dashUniforms);
    dashUnderMaterial = createDashMaterial(dashUniforms, true);
    chargeMaterial = createUnlitMaterial("effects-arrow-charge", EFFECT_COLORS.info, 0.85);
    dischargeMaterial = createUnlitMaterial(
      "effects-arrow-discharge",
      EFFECT_COLORS.discharge,
      0.85,
    );
    postMaterial = createUnlitMaterial("effects-post", EFFECT_COLORS.accent, 0.95);
    dumpMaterial = createUnlitMaterial("effects-arrow-dump", EFFECT_COLORS.dump, 0.9);
    dumpUnderMaterial = createUnlitMaterial("effects-arrow-dump-under", EFFECT_COLORS.under, 0.55);
    lampMaterial = createUnlitMaterial("effects-crane-lamp", EFFECT_COLORS.amber, 0.95);
    craneMaterials = createCraneMaterials();

    stateBands = new BandBatch(solid, "effects-bands-state");
    stateGlow = new BandBatch(glow, "effects-bands-state-glow");
    overlayBands = new BandBatch(solid, "effects-bands-overlay");
    overlayGlow = new BandBatch(glow, "effects-bands-overlay-glow");
    for (const batch of [stateBands, stateGlow, overlayBands, overlayGlow])
      ctx.root.add(batch.mesh);

    dashGeometry = dashQuadGeometry();
    chargeArrows = null;
    dischargeArrows = null;
    arrowGeometry = chevronGeometry();
    postGeometryCache = postGeometry();
  };

  /** Rings and status marks: rebuilt when the turn's state signature moves. */
  const rebuildStateBands = (effects: EffectsState, ctx: ModuleContext): void => {
    if (!stateBands || !stateGlow || !ctxRef) return;
    stateBands.begin();
    stateGlow.begin();
    const bands = stateBands;
    const glows = stateGlow;
    const lift = BAND_LIFT_KM;
    const ring = (
      batch: BandBatch,
      centre: { x: number; z: number },
      radiusKm: number,
      options: {
        color: readonly [number, number, number];
        alpha: number;
        halfWidthKm: number;
        dashPerKm?: number;
        scrollKmPerS?: number;
        pulse?: number;
        phase: number;
        segments?: number;
        /** Screen-space radius ceiling [px] — see BOTTLENECK_RING_PX. */
        clampPx?: number;
      },
    ): void => {
      if (radiusKm <= 0.001) return;
      batch.add({
        spine: conformSpine(ringOf(centre, radiusKm, options.segments ?? 48), ctx.terrain, lift),
        closed: true,
        halfWidthKm: options.halfWidthKm,
        color: options.color,
        alpha: options.alpha,
        dashPerKm: options.dashPerKm,
        scrollKmPerS: options.scrollKmPerS,
        pulse: options.pulse,
        phase: options.phase,
        origin: options.clampPx ? centre : undefined,
        clampPx: options.clampPx,
      });
    };

    // Cities short of power: the red ring the cities module leaves to us.
    for (const city of effects.cities) {
      if (!city.blackout || city.radiusKm <= 0.001) continue;
      const phase = hash01(`city:${city.id}`) * 6.283;
      ring(bands, city, city.radiusKm * 0.8, {
        color: EFFECT_COLORS.alarm,
        alpha: 0.95,
        halfWidthKm: 0.34,
        pulse: 1,
        phase,
      });
      ring(glows, city, city.radiusKm * 0.8, {
        color: EFFECT_COLORS.alarm,
        alpha: 0.5,
        halfWidthKm: 1.2,
        pulse: 1,
        phase,
      });
    }

    // Curtailed farm: dashed amber; switched off: dark steel, no pulse.
    for (const farm of effects.farms) {
      if (farm.radiusKm <= 0.001) continue;
      const phase = hash01(`farm:${farm.id}`) * 6.283;
      if (farm.curtailed) {
        ring(bands, farm, farm.radiusKm * 0.94, {
          color: EFFECT_COLORS.amber,
          alpha: 0.9,
          halfWidthKm: 0.3,
          dashPerKm: 0.085,
          scrollKmPerS: 0,
          phase,
          clampPx: STATUS_RING_PX,
        });
      } else if (farm.disabled) {
        ring(bands, farm, farm.radiusKm * 0.94, {
          color: EFFECT_COLORS.disabled,
          alpha: 0.85,
          halfWidthKm: 0.26,
          phase,
          clampPx: STATUS_RING_PX,
        });
      }
    }

    // A dumping plant carries no ground ring: the amber family is reserved for
    // warn lines and curtailed farms, and a ring in any other hue would still
    // borrow the "status ring" shape. The head-down chevrons in the instanced
    // arrow pass are the marker (see DUMP_ARROW_*).

    stateBands.commit();
    stateGlow.commit();
  };

  /** Hover, selection and the route preview: rebuilt when the pointer moves. */
  const rebuildOverlayBands = (
    scene: WorldScene,
    effects: EffectsState,
    ctx: ModuleContext,
  ): void => {
    const bands = overlayBands;
    const glows = overlayGlow;
    if (!bands || !glows) return;
    bands.begin();
    glows.begin();
    const overlay = scene.overlay;

    if (overlay.hover && overlay.hover.key !== overlay.selection?.key) {
      const centre = hexToWorld(overlay.hover);
      const phase = 0;
      bands.add({
        spine: conformSpine(hexSpine(centre), ctx.terrain, BAND_LIFT_KM * 1.6),
        closed: true,
        halfWidthKm: 0.14,
        color: EFFECT_COLORS.under,
        alpha: 0.6,
        phase,
      });
      bands.add({
        spine: conformSpine(hexSpine(centre), ctx.terrain, BAND_LIFT_KM * 1.7),
        closed: true,
        halfWidthKm: 0.06,
        color: EFFECT_COLORS.hover,
        alpha: 0.95,
        phase,
      });
    }

    if (overlay.selection) {
      const centre = hexToWorld(overlay.selection);
      const phase = 0.12;
      bands.add({
        spine: conformSpine(hexSpine(centre), ctx.terrain, BAND_LIFT_KM * 1.5),
        closed: true,
        halfWidthKm: 0.2,
        color: EFFECT_COLORS.under,
        alpha: 0.55,
        phase,
      });
      bands.add({
        spine: conformSpine(hexSpine(centre), ctx.terrain, BAND_LIFT_KM * 1.7),
        closed: true,
        halfWidthKm: 0.09,
        color: EFFECT_COLORS.accent,
        alpha: 0.95,
        phase,
      });
      glows.add({
        spine: conformSpine(hexSpine(centre), ctx.terrain, BAND_LIFT_KM * 1.7),
        closed: true,
        halfWidthKm: 0.7,
        color: EFFECT_COLORS.accent,
        alpha: 0.3,
        phase,
      });
    }

    const route = overlay.route;
    if (route && route.path.length >= 2) {
      const centres = route.path.map((hex) => hexToWorld(hex));
      const spine = conformSpine(centres, ctx.terrain, BAND_LIFT_KM * 1.6);
      const invalid = !route.valid;
      const color = invalid ? EFFECT_COLORS.alarm : EFFECT_COLORS.accent;
      const halfWidth = ROUTE_HALF_KM[route.lineType];
      bands.add({
        spine: conformSpine(centres, ctx.terrain, BAND_LIFT_KM),
        halfWidthKm: halfWidth * 1.8,
        color: EFFECT_COLORS.under,
        alpha: 0.5,
        phase: 0,
      });
      bands.add({
        spine,
        halfWidthKm: halfWidth,
        color,
        alpha: 0.92,
        dashPerKm: invalid ? 0.34 : 0,
        scrollKmPerS: invalid ? 0 : 0,
        phase: 0,
      });
      if (!invalid) {
        glows.add({
          spine,
          halfWidthKm: halfWidth * 2.2,
          color,
          alpha: 0.22,
          phase: 0,
        });
      }
    }

    // The bottleneck: red pulse on the hexes the interface named, or on the
    // worst warn / over segment of the shown turn when nothing was clicked
    // (docs/08 §3: the one worst bottleneck gets a red ground ring).
    const named = scene.overlay.bottleneck;
    const derived = named ? null : worstBottleneck(effects);
    const hexes = named?.hexes ?? derived?.hexes ?? [];
    const spine = named
      ? named.segmentKey
        ? fineGridSpine(effects, named.segmentKey)
        : null
      : (derived?.spine ?? null);
    if (hexes.length > 0) {
      const phase = hash01(`bottleneck:${named?.segmentKey ?? "derived"}`) * 6.283;
      const markPoints: GroundPoint[] =
        spine && spine.length >= 2
          ? spine.map((point) => ({ x: point.x, z: point.z }))
          : hexes.map((hex) => hexToWorld(hex));
      const marks = markPoints.length >= 2 ? markPoints : null;
      // One ring per alert, at the middle of the stretch: two rings bracketing
      // the span read as two bottlenecks, and at the strategic view their glow
      // passes merge into one red wash over two objects (critic finding, s3).
      // A single-hex alert (a named node, or a one-hex stretch) rings its hex.
      const centre: GroundPoint | null =
        hexes.length <= 1 ? (hexes[0] ? hexToWorld(hexes[0]) : null) : midpointOf(markPoints);
      // A ring that would land inside a city already carrying its blackout
      // ring is skipped: the short city is the same signal, and two reds on
      // one place read as one. A click (`named`) always rings.
      const overlapsShortCity =
        named === null &&
        centre !== null &&
        effects.cities.some(
          (city) =>
            city.blackout && Math.hypot(city.x - centre.x, city.z - centre.z) <= city.radiusKm,
        );
      if (centre && !overlapsShortCity) {
        const radius = HEX_RADIUS_KM * 0.78;
        bands.add({
          spine: conformSpine(ringOf(centre, radius, 36), ctx.terrain, BAND_LIFT_KM * 1.9),
          closed: true,
          halfWidthKm: 0.4,
          color: EFFECT_COLORS.alarm,
          alpha: 0.95,
          pulse: 1,
          phase,
          origin: centre,
          clampPx: BOTTLENECK_RING_PX,
        });
        glows.add({
          spine: conformSpine(ringOf(centre, radius, 36), ctx.terrain, BAND_LIFT_KM * 1.9),
          closed: true,
          halfWidthKm: 1.4,
          color: EFFECT_COLORS.alarm,
          alpha: 0.42,
          pulse: 1,
          phase,
          origin: centre,
          clampPx: BOTTLENECK_GLOW_PX,
        });
      }
      if (marks) {
        bands.add({
          spine: conformSpine(marks, ctx.terrain, BAND_LIFT_KM * 1.9),
          halfWidthKm: 0.26,
          color: EFFECT_COLORS.alarm,
          alpha: 0.75,
          pulse: 1,
          phase: phase + 0.9,
          clampPx: BOTTLENECK_BAND_PX,
        });
        glows.add({
          spine: conformSpine(marks, ctx.terrain, BAND_LIFT_KM * 1.9),
          halfWidthKm: 1.2,
          color: EFFECT_COLORS.alarm,
          alpha: 0.24,
          pulse: 1,
          phase: phase + 0.9,
          clampPx: BOTTLENECK_BAND_GLOW_PX,
        });
        // Segment-end brackets: two bars across the conductor at each end of
        // the overloaded stretch. The single ring marks the middle, so the
        // brackets are what say where the stretch begins and ends; they ride
        // the line itself and survive any framing, including a closeup that
        // puts the midpoint ring out of frame.
        const at = (index: number): GroundPoint => {
          const point = marks[index];
          return point ?? (marks[0] as GroundPoint);
        };
        const endBar = (end: GroundPoint, towards: GroundPoint): void => {
          const dx = towards.x - end.x;
          const dz = towards.z - end.z;
          const length = Math.hypot(dx, dz) || 1;
          const px = -dz / length;
          const pz = dx / length;
          for (let bar = 0; bar < 2; bar++) {
            const back = bar * END_BAR_GAP_KM;
            const centre = { x: end.x - (dx / length) * back, z: end.z - (dz / length) * back };
            const barSpine = conformSpine(
              [
                { x: centre.x - px * END_BAR_HALF_KM, z: centre.z - pz * END_BAR_HALF_KM },
                { x: centre.x + px * END_BAR_HALF_KM, z: centre.z + pz * END_BAR_HALF_KM },
              ],
              ctx.terrain,
              BAND_LIFT_KM * 2,
            );
            bands.add({
              spine: barSpine,
              halfWidthKm: 0.32,
              color: EFFECT_COLORS.alarm,
              alpha: 0.9,
              pulse: 1,
              phase,
              clampPx: BOTTLENECK_BAND_PX,
            });
            glows.add({
              spine: barSpine,
              halfWidthKm: 1.1,
              color: EFFECT_COLORS.alarm,
              alpha: 0.32,
              pulse: 1,
              phase,
              clampPx: BOTTLENECK_BAND_GLOW_PX,
            });
          }
        };
        endBar(at(0), at(1));
        endBar(at(marks.length - 1), at(marks.length - 2));
      }
    }

    bands.commit();
    glows.commit();
  };

  /** Waypoint posts of the route preview, one instanced mesh, ≤ 8 × 12 tris. */
  const rebuildPosts = (scene: WorldScene, ctx: ModuleContext): void => {
    if (!posts || !ctxRef) return;
    const waypoints = scene.overlay.route?.waypoints ?? [];
    const count = Math.min(waypoints.length, POST_CAPACITY);
    for (let i = 0; i < count; i++) {
      const hex = waypoints[i];
      if (!hex) continue;
      const centre = hexToWorld(hex);
      const y = ctx.terrain.heightAt(centre.x, centre.z) + BAND_LIFT_KM;
      matrix.makeScale(1.1, 3.2, 1.1).setPosition(centre.x, y, centre.z);
      posts.setMatrixAt(i, matrix);
    }
    posts.count = count;
    posts.instanceMatrix.needsUpdate = true;
  };

  /** Flow dashes of the loaded segments and the border corridors. */
  const rebuildDashes = (effects: EffectsState, ctx: ModuleContext): void => {
    if (!ctxRef) return;
    const detail = QUALITY_PROFILES[ctx.quality].detail;
    const records: {
      from: THREE.Vector3;
      to: THREE.Vector3;
      dir: THREE.Vector3;
      color: readonly [number, number, number];
      phase: number;
      speed: number;
      size: number;
      alpha: number;
    }[] = [];
    const push = (
      spine: THREE.Vector3[],
      reverse: boolean,
      color: readonly [number, number, number],
      alpha: number,
      perUnit: number,
      key: string,
    ): void => {
      // Travel units one hex long (resampled, sag kept), each carrying
      // `perUnit` dashes spread evenly inside it: density follows the segment's
      // load, the speed stays the docs' ~1 hex/s whatever the sampling.
      const units = resampleByArc(spine, DASH_STEP_KM);
      const count = Math.max(1, Math.min(4, Math.round(perUnit)));
      const jitter = hash01(`flow:${key}`);
      for (let j = 0; j < units.length - 1; j++) {
        const a = units[j];
        const b = units[j + 1];
        if (!a || !b) continue;
        const from = reverse ? b : a;
        const to = reverse ? a : b;
        const dir = new THREE.Vector3().subVectors(to, from).normalize();
        for (let k = 0; k < count; k++) {
          if (records.length >= MAX_DASHES) return;
          const phase = (k + 0.5) / count + jitter;
          records.push({
            from,
            to,
            dir,
            color,
            phase: phase - Math.floor(phase),
            speed: 1,
            size: 0.13,
            alpha,
          });
        }
      }
    };

    for (const flow of effects.flows) {
      push(
        flow.spine,
        flow.reverse,
        DASH_COLOR[flow.load],
        DASH_ALPHA[flow.load],
        1 + flow.ratio * 5 * detail,
        flow.key,
      );
    }
    for (const border of effects.borders) {
      if (border.ratio <= 0.02 || (!border.importing && !border.exporting)) continue;
      const color = border.importing ? EFFECT_COLORS.info : EFFECT_COLORS.amber;
      // Import runs inward: the polyline's foreign end is first, the portal last.
      push(
        border.spine,
        !border.importing,
        color,
        0.35 + 0.55 * border.ratio,
        2 + border.ratio * 6 * detail,
        border.id,
      );
    }

    const capacity = Math.max(records.length, 1);
    if (!ctxRef) return;
    if (dashMesh) {
      ctxRef.root.remove(dashMesh);
      dashMesh.dispose();
    }
    if (dashUnderMesh) {
      ctxRef.root.remove(dashUnderMesh);
      dashUnderMesh.dispose();
    }
    const geometry = dashGeometry as THREE.BufferGeometry;
    const mesh = new THREE.InstancedMesh(geometry, dashMaterial as THREE.Material, capacity);
    mesh.name = "effects-dashes";
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    const under = new THREE.InstancedMesh(geometry, dashUnderMaterial as THREE.Material, capacity);
    under.name = "effects-dashes-under";
    under.frustumCulled = false;
    under.renderOrder = 6.9;
    const from = new Float32Array(capacity * 3);
    const to = new Float32Array(capacity * 3);
    const dir = new Float32Array(capacity * 3);
    const colorAttr = new Float32Array(capacity * 3);
    const params = new Float32Array(capacity * 4);
    records.forEach((record, i) => {
      from.set([record.from.x, record.from.y, record.from.z], i * 3);
      to.set([record.to.x, record.to.y, record.to.z], i * 3);
      dir.set([record.dir.x, record.dir.y, record.dir.z], i * 3);
      colorAttr.set([record.color[0], record.color[1], record.color[2]], i * 3);
      params.set([record.phase, record.speed, record.size, record.alpha], i * 4);
    });
    geometry.setAttribute("aFrom", new THREE.InstancedBufferAttribute(from, 3));
    geometry.setAttribute("aTo", new THREE.InstancedBufferAttribute(to, 3));
    geometry.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 3));
    geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(colorAttr, 3));
    geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    mesh.count = capacity;
    under.count = capacity;
    ctxRef.root.add(under);
    ctxRef.root.add(mesh);
    dashUnderMesh = under;
    dashMesh = mesh;
  };

  /** Storage chevrons: a ring of arrows pointing in (charge) or out (discharge). */
  const rebuildArrows = (effects: EffectsState, ctx: ModuleContext): void => {
    arrowsSpec = [];
    for (const storage of effects.storages) {
      if (storage.magnitude <= 0.02 || storage.direction === "idle") continue;
      const baseY = ctx.terrain.heightAt(storage.x, storage.z);
      const count = 8;
      for (let i = 0; i < count && arrowsSpec.length < ARROW_CAPACITY; i++) {
        arrowsSpec.push({
          x: storage.x,
          z: storage.z,
          baseY,
          angle: (i / count) * Math.PI * 2,
          direction: storage.direction === "charge" ? -1 : 1,
          magnitude: storage.magnitude,
        });
      }
    }
    const charge = arrowsSpec.filter((spec) => spec.direction < 0).length;
    const discharge = arrowsSpec.length - charge;
    if (chargeArrows) {
      chargeArrows.count = charge;
      chargeArrows.visible = charge > 0;
    }
    if (dischargeArrows) {
      dischargeArrows.count = discharge;
      dischargeArrows.visible = discharge > 0;
    }

    // Dumping plants: one pale chevron standing over the site, head down into
    // the ground — the literal "spilled" read. No amber, no ring: the shape
    // is the marker (critic finding, s3).
    dumpSpec = [];
    for (const plant of effects.plants) {
      if (!plant.dump || dumpSpec.length >= DUMP_CAPACITY) continue;
      dumpSpec.push({ x: plant.x, z: plant.z });
    }
    if (dumpArrows) {
      dumpArrows.count = dumpSpec.length;
      dumpArrows.visible = dumpSpec.length > 0;
    }
    if (dumpUnderArrows) {
      dumpUnderArrows.count = dumpSpec.length;
      dumpUnderArrows.visible = dumpSpec.length > 0;
    }
  };

  /** Dump arrows: vertical chevrons yawed to face the camera, breathing. */
  const updateDumps = (ctx: ModuleContext): void => {
    if (!dumpArrows || dumpSpec.length === 0) return;
    const camera = ctx.view.camera;
    const height = Math.max(1, ctx.renderer.domElement.clientHeight || 900);
    const pxKm = (2 * Math.tan((camera.fov * DEG) / 2)) / height;
    for (let i = 0; i < dumpSpec.length; i++) {
      const spec = dumpSpec[i];
      if (!spec) continue;
      const baseY = ctx.terrain.heightAt(spec.x, spec.z);
      const dx = camera.position.x - spec.x;
      const dy = camera.position.y - (baseY + DUMP_ARROW_LIFT_KM);
      const dz = camera.position.z - spec.z;
      const distance = Math.hypot(dx, dy, dz);
      // Screen-space size floor (the crane lamp's rule): the surplus has no
      // ring left to read at 500 km, so the arrow must not shrink under the
      // horizon. The lift follows so the head stays near the ground plane.
      const arrowKm = Math.min(
        DUMP_ARROW_MAX_KM,
        Math.max(DUMP_ARROW_KM, pxKm * distance * DUMP_ARROW_MIN_PX),
      );
      const liftKm = Math.max(DUMP_ARROW_LIFT_KM, arrowKm * 1.4);
      const length = Math.hypot(dx, dz) || 1;
      const nx = dx / length;
      const nz = dz / length;
      // Local +X points down, local +Y at the camera: the chevron reads head
      // down from any yaw, and the billboard keeps it from being edge-on.
      const place = (mesh: THREE.InstancedMesh, km: number): void => {
        _axisX.set(0, -km, 0);
        _axisY.set(nx * km, 0, nz * km);
        _axisZ.set(-nz * km, 0, nx * km);
        matrix.makeBasis(_axisX, _axisY, _axisZ);
        matrix.setPosition(spec.x, baseY + liftKm, spec.z);
        mesh.setMatrixAt(i, matrix);
      };
      place(dumpArrows, arrowKm);
      // The dark rim first, so the pale chevron keeps its edge on a white
      // plant roof at noon and the amber dump glow at night.
      if (dumpUnderArrows) place(dumpUnderArrows, arrowKm * DUMP_ARROW_UNDER_SCALE);
    }
    dumpArrows.instanceMatrix.needsUpdate = true;
    if (dumpUnderArrows) dumpUnderArrows.instanceMatrix.needsUpdate = true;
    if (dumpMaterial) {
      dumpMaterial.opacity = ctx.motion.ambient
        ? 0.5 + 0.45 * (0.5 + 0.5 * Math.cos(Math.PI * ambientTime))
        : 0.92;
    }
  };

  /** Slew, rope and hook matrices for every crane (one instanced mesh per part). */
  const updateCranes = (ctx: ModuleContext): void => {
    const parts = craneParts;
    if (!parts || cranes.length === 0) return;
    const ambient = ctx.motion.ambient;
    const camera = ctx.view.camera;
    const height = Math.max(1, ctx.renderer.domElement.clientHeight || 900);
    const pxKm = (2 * Math.tan((camera.fov * DEG) / 2)) / height;
    for (let i = 0; i < cranes.length; i++) {
      const crane = cranes[i];
      if (!crane) continue;
      // Silhouette floor: at 500 km a true-scale crane mast is ~2 px, so the
      // works read leaned on the grid's scaffold marker alone. Grow the
      // machine about its base until the mast is at least CRANE_MIN_PX tall;
      // the cap keeps it a crane, not a tower.
      const dx = camera.position.x - crane.x;
      const dy = camera.position.y - crane.y;
      const dz = camera.position.z - crane.z;
      const distance = Math.hypot(dx, dy, dz);
      const mastPx = HEIGHT_KM.crane / Math.max(1e-6, pxKm * distance);
      const grow = Math.min(CRANE_MAX_SCALE, Math.max(1, CRANE_MIN_PX / Math.max(0.01, mastPx)));
      const mastHeight = HEIGHT_KM.crane * grow;
      const slew = ambient ? crane.phase + ambientTime * CRANE_SLEW_RAD_S : crane.phase + 0.6;
      // Mast + ballast.
      position.set(crane.x, crane.y, crane.z);
      quaternion.setFromAxisAngle(UP, crane.yaw);
      scale.set(grow, grow, grow);
      matrix.compose(position, quaternion, scale);
      parts.mast.setMatrixAt(i, matrix);
      parts.mast.instanceMatrix.needsUpdate = true;
      // Slewing unit at the mast top.
      const topY = crane.y + mastHeight;
      position.set(crane.x, topY, crane.z);
      quaternion.setFromAxisAngle(UP, crane.yaw + slew);
      matrix.compose(position, quaternion, scale);
      parts.slew.setMatrixAt(i, matrix);
      parts.slew.instanceMatrix.needsUpdate = true;
      // Rope from the trolley down, hook block at its end.
      const trolleyR = 0.55 * (mastHeight * 1.25);
      const cos = Math.cos(crane.yaw + slew);
      const sin = Math.sin(crane.yaw + slew);
      const tieX = crane.x + cos * trolleyR;
      const tieZ = crane.z - sin * trolleyR;
      const hookY = crane.y + mastHeight * 0.22;
      position.set(tieX, topY, tieZ);
      quaternion.identity();
      scale.set(grow, topY - hookY, grow);
      matrix.compose(position, quaternion, scale);
      parts.rope.setMatrixAt(i, matrix);
      parts.rope.instanceMatrix.needsUpdate = true;
      quaternion.setFromAxisAngle(UP, crane.yaw);
      position.set(tieX, hookY, tieZ);
      scale.set(grow, grow, grow);
      matrix.compose(position, quaternion, scale);
      parts.hook.setMatrixAt(i, matrix);
      parts.hook.instanceMatrix.needsUpdate = true;
      // Aviation lamp on the mast top: a screen-space-floored amber dot is
      // what makes the works read at the strategic view, where the lattice is
      // a couple of pixels tall. Clamped so it stays a light, not a lantern,
      // at the detail camera. It blinks; with ambient motion off it is a
      // steady light (the static twin).
      const lampKm = Math.min(2.0, Math.max(0.07, pxKm * distance * 3));
      position.set(crane.x, topY + lampKm * 0.6, crane.z);
      quaternion.identity();
      scale.set(lampKm, lampKm, lampKm);
      matrix.compose(position, quaternion, scale);
      parts.lamp.setMatrixAt(i, matrix);
      parts.lamp.instanceMatrix.needsUpdate = true;
    }
    if (lampMaterial) {
      lampMaterial.opacity = ambient
        ? 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(Math.PI * 2 * ambientTime * 0.5))
        : 1;
    }
  };

  /** Chevron matrices: a slow drift inward or outward, static when stateful motion is off. */
  const updateArrows = (dt: number, ctx: ModuleContext): void => {
    if (arrowsSpec.length === 0) return;
    if (ctx.motion.stateful) arrowTime += dt;
    const travel = 3.2;
    let chargeIndex = 0;
    let dischargeIndex = 0;
    for (let i = 0; i < arrowsSpec.length; i++) {
      const spec = arrowsSpec[i];
      if (!spec) continue;
      const target = spec.direction < 0 ? chargeArrows : dischargeArrows;
      if (!target) continue;
      const index = spec.direction < 0 ? chargeIndex++ : dischargeIndex++;
      const cycle = (((arrowTime * 0.55 + i * 0.37) % 1) + 1) % 1;
      const radius = 5.5 + travel * (spec.direction < 0 ? 1 - cycle : cycle);
      const magnitude = spec.magnitude;
      const size = 0.55 + 0.75 * magnitude;
      const x = spec.x + Math.cos(spec.angle) * radius;
      const z = spec.z + Math.sin(spec.angle) * radius;
      position.set(x, ctx.terrain.heightAt(x, z) + BAND_LIFT_KM * 1.2, z);
      // The chevron points along +X; a charge arrow points at the site centre.
      quaternion.setFromAxisAngle(UP, spec.direction < 0 ? -Math.PI - spec.angle : -spec.angle);
      scale.set(size, 1, size * (0.8 + 0.4 * magnitude));
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(index, matrix);
      target.instanceMatrix.needsUpdate = true;
    }
    if (chargeMaterial) chargeMaterial.opacity = 0.45 + 0.5 * magnitudeOf(arrowsSpec, -1);
    if (dischargeMaterial) dischargeMaterial.opacity = 0.45 + 0.5 * magnitudeOf(arrowsSpec, 1);
  };

  /** Cranes rebuilt on the hook signature: one instanced part per part of the machine. */
  const rebuildCranes = (effects: EffectsState, ctx: ModuleContext): void => {
    if (!ctxRef || !craneMaterials) return;
    cranes = effects.cranes.map((mark) => {
      const jitter = hash01(`crane:${mark.key}`);
      // A crane stands beside the works, clear of the structure and its own
      // construction marker, with the jib reaching over what is being built.
      const angle = jitter * Math.PI * 2 + Math.PI / 4;
      const x = mark.x + Math.cos(angle) * CRANE_OFFSET_KM;
      const z = mark.z + Math.sin(angle) * CRANE_OFFSET_KM;
      const y = ctx.terrain.heightAt(x, z);
      // The jib points at the structure's own anchor (the hook nodes published).
      const yaw = Math.atan2(-(mark.z - z), mark.x - x);
      return { x, y, z, yaw, phase: jitter * 2.4 };
    });
    const needed = Math.max(cranes.length, 1);
    if (needed !== craneCapacity) {
      if (craneParts) {
        ctxRef.root.remove(craneParts.mast, craneParts.slew, craneParts.rope, craneParts.hook);
        craneParts.mast.dispose();
        craneParts.slew.dispose();
        craneParts.rope.dispose();
        craneParts.hook.dispose();
        craneParts = null;
      }
      craneCapacity = needed;
      const definitions = [
        { geometry: craneMastGeometry(), material: craneMaterials.paint, name: "mast" },
        { geometry: craneSlewGeometry(), material: craneMaterials.paint, name: "slew" },
        { geometry: craneRopeGeometry(), material: craneMaterials.steel, name: "rope" },
        { geometry: craneHookGeometry(), material: craneMaterials.steel, name: "hook" },
        {
          geometry: postGeometryCache as THREE.BufferGeometry,
          material: lampMaterial as THREE.Material,
          name: "lamp",
        },
      ];
      craneGeometries.length = 0;
      for (const definition of definitions) {
        if (definition.name !== "lamp") craneGeometries.push(definition.geometry);
      }
      const built = definitions.map((definition) => {
        const mesh = new THREE.InstancedMesh(
          definition.geometry,
          definition.material,
          craneCapacity,
        );
        mesh.name = `effects-crane-${definition.name}`;
        mesh.count = 1;
        mesh.frustumCulled = false;
        mesh.castShadow = QUALITY_PROFILES[ctx.quality].shadows;
        ctxRef?.root.add(mesh);
        return mesh;
      });
      const [mast, slew, rope, hook, lamp] = built;
      if (mast && slew && rope && hook && lamp) craneParts = { mast, slew, rope, hook, lamp };
    }
    if (craneParts) {
      const visible = cranes.length > 0;
      for (const mesh of [
        craneParts.mast,
        craneParts.slew,
        craneParts.rope,
        craneParts.hook,
        craneParts.lamp,
      ]) {
        mesh.count = cranes.length;
        mesh.visible = visible;
      }
    }
    updateCranes(ctx);
  };

  const structuralKey = (scene: WorldScene, ctx: ModuleContext): string =>
    [
      scene.cities.map((city) => city.id).join(","),
      scene.farms.map((farm) => farm.id).join(","),
      scene.plants.map((plant) => plant.id).join(","),
      scene.storages.map((storage) => storage.id).join(","),
      scene.sites.map((site) => site.id).join(","),
      scene.borders.map((border) => border.id).join(","),
      scene.lines.map((line) => line.id).join(","),
      ctx.quality,
    ].join("|");

  return {
    id: "effects",

    init(ctx) {
      ctxRef = ctx;
      ensureResources(ctx);
      const postMesh = new THREE.InstancedMesh(
        postGeometryCache as THREE.BufferGeometry,
        postMaterial as THREE.Material,
        POST_CAPACITY,
      );
      postMesh.name = "effects-route-posts";
      postMesh.count = 0;
      postMesh.frustumCulled = false;
      ctx.root.add(postMesh);
      posts = postMesh;
      const chargeMesh = new THREE.InstancedMesh(
        arrowGeometry as THREE.BufferGeometry,
        chargeMaterial as THREE.Material,
        ARROW_CAPACITY,
      );
      chargeMesh.name = "effects-arrows-charge";
      chargeMesh.count = 0;
      chargeMesh.frustumCulled = false;
      ctx.root.add(chargeMesh);
      chargeArrows = chargeMesh;
      const dischargeMesh = new THREE.InstancedMesh(
        arrowGeometry as THREE.BufferGeometry,
        dischargeMaterial as THREE.Material,
        ARROW_CAPACITY,
      );
      dischargeMesh.name = "effects-arrows-discharge";
      dischargeMesh.count = 0;
      dischargeMesh.frustumCulled = false;
      ctx.root.add(dischargeMesh);
      dischargeArrows = dischargeMesh;
      const dumpUnderMesh = new THREE.InstancedMesh(
        arrowGeometry as THREE.BufferGeometry,
        dumpUnderMaterial as THREE.Material,
        DUMP_CAPACITY,
      );
      dumpUnderMesh.name = "effects-arrows-dump-under";
      dumpUnderMesh.count = 0;
      dumpUnderMesh.frustumCulled = false;
      dumpUnderMesh.renderOrder = 5.8;
      ctx.root.add(dumpUnderMesh);
      dumpUnderArrows = dumpUnderMesh;
      const dumpMesh = new THREE.InstancedMesh(
        arrowGeometry as THREE.BufferGeometry,
        dumpMaterial as THREE.Material,
        DUMP_CAPACITY,
      );
      dumpMesh.name = "effects-arrows-dump";
      dumpMesh.count = 0;
      dumpMesh.frustumCulled = false;
      dumpMesh.renderOrder = 5.9;
      ctx.root.add(dumpMesh);
      dumpArrows = dumpMesh;
      if (!dashMesh && dashGeometry && dashMaterial && dashUnderMaterial) {
        const empty = new THREE.InstancedMesh(dashGeometry, dashMaterial, 1);
        empty.name = "effects-dashes";
        empty.count = 0;
        empty.frustumCulled = false;
        empty.renderOrder = 7;
        ctx.root.add(empty);
        dashMesh = empty;
        const emptyUnder = new THREE.InstancedMesh(dashGeometry, dashUnderMaterial, 1);
        emptyUnder.name = "effects-dashes-under";
        emptyUnder.count = 0;
        emptyUnder.frustumCulled = false;
        emptyUnder.renderOrder = 6.9;
        ctx.root.add(emptyUnder);
        dashUnderMesh = emptyUnder;
      }
    },

    update(scene, _previous, ctx) {
      ctxRef = ctx;
      ensureResources(ctx);

      const nextHookKey = structuralKey(scene, ctx);
      if (nextHookKey !== hookKey || !hooks) {
        hookKey = nextHookKey;
        hooks = buildHookIndex(ctx.scene);
      }
      const effects = readEffectsState(scene, hooks);

      const nextStateKey = `${effects.ringSignature}|${effects.flowSignature}|${ctx.quality}`;
      if (nextStateKey !== stateKey) {
        stateKey = nextStateKey;
        rebuildStateBands(effects, ctx);
        rebuildDashes(effects, ctx);
        rebuildArrows(effects, ctx);
        rebuildCranes(effects, ctx);
      }

      const bottleneck = scene.overlay.bottleneck;
      const derived = bottleneck ? null : worstBottleneck(effects);
      const route = scene.overlay.route;
      const nextOverlayKey = [
        scene.overlay.hover?.key ?? "-",
        scene.overlay.selection?.key ?? "-",
        route
          ? `${route.valid ? "v" : "x"}:${route.lineType}:${route.path.map((hex) => hex.key).join(",")}`
          : "-",
        bottleneck
          ? `${bottleneck.kind}:${bottleneck.segmentKey ?? bottleneck.hexes.map((hex) => hex.key).join(",")}`
          : "-",
        derived ? derived.hexes.map((hex) => hex.key).join(",") : "-",
      ].join("|");
      if (nextOverlayKey !== overlayKey) {
        overlayKey = nextOverlayKey;
        rebuildOverlayBands(scene, effects, ctx);
        rebuildPosts(scene, ctx);
      }
    },

    frame(dt, ctx) {
      const motion = ctx.motion;
      if (motion.ambient) ambientTime += dt;
      if (motion.stateful) flowTime += dt;
      const camera = ctx.view.camera;
      const height = Math.max(1, ctx.renderer.domElement.clientHeight || 900);
      const pxKm = (2 * Math.tan((camera.fov * DEG) / 2)) / height;
      const daylight = Math.min(1, Math.max(0, ctx.environment.daylight));
      bandUniforms.sync(ambientTime, pxKm, motion.ambient ? PULSE_AMPLITUDE : 0, daylight);
      dashUniforms.uTime.value = flowTime;
      dashUniforms.uPxKm.value = pxKm;
      updateCranes(ctx);
      updateArrows(dt, ctx);
      updateDumps(ctx);
    },

    dispose() {
      for (const batch of [stateBands, stateGlow, overlayBands, overlayGlow]) batch?.dispose();
      if (craneParts) {
        for (const mesh of [
          craneParts.mast,
          craneParts.slew,
          craneParts.rope,
          craneParts.hook,
          craneParts.lamp,
        ]) {
          ctxRef?.root.remove(mesh);
          mesh.dispose();
        }
        craneParts = null;
      }
      for (const geometry of craneGeometries) geometry.dispose();
      craneGeometries.length = 0;
      craneCapacity = 0;
      if (dashMesh) {
        ctxRef?.root.remove(dashMesh);
        dashMesh.dispose();
        dashMesh = null;
      }
      if (dashUnderMesh) {
        ctxRef?.root.remove(dashUnderMesh);
        dashUnderMesh.dispose();
        dashUnderMesh = null;
      }
      dashGeometry?.dispose();
      dashGeometry = null;
      for (const mesh of [chargeArrows, dischargeArrows]) {
        if (!mesh) continue;
        ctxRef?.root.remove(mesh);
        mesh.dispose();
      }
      chargeArrows = null;
      dischargeArrows = null;
      if (dumpArrows) {
        ctxRef?.root.remove(dumpArrows);
        dumpArrows.dispose();
        dumpArrows = null;
      }
      if (dumpUnderArrows) {
        ctxRef?.root.remove(dumpUnderArrows);
        dumpUnderArrows.dispose();
        dumpUnderArrows = null;
      }
      arrowGeometry?.dispose();
      arrowGeometry = null;
      dumpSpec = [];
      if (posts) {
        ctxRef?.root.remove(posts);
        posts.dispose();
        posts = null;
      }
      postGeometryCache?.dispose();
      postGeometryCache = null;
      solid?.dispose();
      glow?.dispose();
      dashMaterial?.dispose();
      dashUnderMaterial?.dispose();
      chargeMaterial?.dispose();
      dischargeMaterial?.dispose();
      dumpMaterial?.dispose();
      dumpUnderMaterial?.dispose();
      lampMaterial?.dispose();
      postMaterial?.dispose();
      craneMaterials?.paint.dispose();
      craneMaterials?.steel.dispose();
      craneMaterials?.cable.dispose();
      solid = null;
      glow = null;
      dashMaterial = null;
      dashUnderMaterial = null;
      chargeMaterial = null;
      dischargeMaterial = null;
      dumpMaterial = null;
      dumpUnderMaterial = null;
      lampMaterial = null;
      postMaterial = null;
      craneMaterials = null;
      stateBands = null;
      stateGlow = null;
      overlayBands = null;
      overlayGlow = null;
      hooks = null;
      hookKey = "";
      stateKey = "";
      overlayKey = "";
      cranes = [];
      arrowsSpec = [];
      ambientTime = 0;
      flowTime = 0;
      arrowTime = 0;
      ctxRef = null;
    },
  };
}
