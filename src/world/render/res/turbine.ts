// Wind turbine archetypes (docs/08 §2–§3): one geometry per repeated part,
// drawn as instances. Modelled on the 3 MW onshore class (Vestas V90/V112,
// Siemens SWT-3.0: 4,5 m tower foot, 3-blade upwind rotor, 15 m nacelle with
// the cooler at the tail) and on the Baltic monopile foundations (Baltic 2,
// Kriegers Flak: yellow transition piece with a boat landing and a platform).
// Heights come from the exaggeration table only — hub 2 km, tip 3 km — and
// everything else keeps the real proportions to them.
//
// Local frames: a turbine's +Z is forward (rotor side), +Y up. The tower
// stands at its foot; the nacelle sits on its top; the rotor turns about the
// nacelle's +Z axis, hub centre HUB_OFFSET_KM ahead of the tower axis.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { HEIGHT_KM } from "../core/exaggeration";

export const HUB_HEIGHT_KM = HEIGHT_KM.turbineHub;
export const ROTOR_RADIUS_KM = HEIGHT_KM.turbineTip - HEIGHT_KM.turbineHub;
/** Rotor hub centre ahead of the tower axis. */
export const HUB_OFFSET_KM = 0.16;
/** Height of the offshore transition-piece platform above sea level. */
export const TP_TOP_KM = 0.415;
/** Nacelle height: the tower stops half of it below the hub. */
const NACELLE_H = 0.11;
const NACELLE_W = 0.12;
const NACELLE_L = 0.3;
const TOWER_TOP_R = 0.03;
const TOWER_FOOT_R = 0.045;
/** Rated rotor speed [rad/s] — 12 rpm, the 3 MW class. */
export const RATED_ROTOR_RAD_S = (12 * 2 * Math.PI) / 60;
/** Parked position of a still or switched-off rotor: one blade straight up (a "Y"). */
export const PARKED_ANGLE = 0;
/**
 * Storm parking: one blade straight down, the other two raised ("rabbit
 * ears") — the position the controllers park in past cut-out to keep the
 * feathered blades clear of the tower — so a feathered farm has a different
 * silhouette from a becalmed one even where the pitch cannot be read.
 */
export const FEATHERED_ANGLE = Math.PI / 3;

const DEG = Math.PI / 180;

/** Fills a colour attribute and drops the uv the unmapped materials never read. */
export function paint(
  geometry: THREE.BufferGeometry,
  rgb: readonly [number, number, number],
  keepUv = false,
): THREE.BufferGeometry {
  const color = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  const count = geometry.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (!keepUv) geometry.deleteAttribute("uv");
  return geometry;
}

/** Merges and frees the parts. */
export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  if (!result) throw new Error("res: geometry merge failed");
  for (const part of parts) part.dispose();
  result.computeBoundingSphere();
  return result;
}

export const WHITE: readonly [number, number, number] = [0.9, 0.91, 0.9];
const DARK: readonly [number, number, number] = [0.22, 0.23, 0.24];
const CONCRETE: readonly [number, number, number] = [0.62, 0.6, 0.56];
const PILE: readonly [number, number, number] = [0.2, 0.19, 0.18];
const SPLASH: readonly [number, number, number] = [0.42, 0.24, 0.13];
const YELLOW: readonly [number, number, number] = [0.98, 0.72, 0.06];

/**
 * A tapered tower `height` km tall standing at the origin, foot → top along
 * +Y with the texture's v. The module draws it at unit height and scales
 * each instance to its own tower height (onshore from the pedestal, offshore
 * from the transition piece), so one InstancedMesh serves every turbine.
 */
export function towerGeometry(height: number): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(TOWER_TOP_R, TOWER_FOOT_R, height, 14, 1, false);
  shaft.translate(0, height / 2, 0);
  const geometry = paint(shaft, WHITE, true);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Tower height for a hub at HUB_HEIGHT_KM above `baseKm`. */
export function towerHeight(baseKm: number): number {
  return HUB_HEIGHT_KM - baseKm - NACELLE_H / 2;
}

/** The aviation light's fixture on the nacelle roof, in the nacelle's frame. */
export const LIGHT_OFFSET = { x: 0, y: NACELLE_H / 2 + 0.03, z: -0.06 } as const;

/**
 * Nacelle centred over the tower axis at the hub height; +Z toward the rotor.
 * The anemometer mast at the tail and the red lens of the obstruction light
 * on the roof are merged in — the light itself is a glow sprite (lights.ts).
 */
export function nacelleGeometry(): THREE.BufferGeometry {
  // RoundedBoxGeometry is non-indexed; re-index it so the merge stays indexed.
  const body = mergeVertices(new RoundedBoxGeometry(NACELLE_W, NACELLE_H, NACELLE_L, 2, 0.025));
  body.translate(0, 0, -0.03);
  const cooler = new THREE.BoxGeometry(NACELLE_W * 0.7, NACELLE_H * 0.6, 0.06);
  cooler.translate(0, 0.01, -NACELLE_L / 2 - 0.03);
  const mast = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5, 1);
  mast.translate(0, NACELLE_H / 2 + 0.03, -0.12);
  const lens = new THREE.SphereGeometry(0.016, 8, 6);
  lens.translate(LIGHT_OFFSET.x, LIGHT_OFFSET.y - 0.008, LIGHT_OFFSET.z);
  return merged([
    paint(body, WHITE),
    paint(cooler, DARK),
    paint(mast, DARK),
    paint(lens, [0.45, 0.03, 0.02]),
  ]);
}

/**
 * Concrete pedestal of an onshore tower with its crane hardstand, origin on
 * the ground. Ground footprints follow the ×8 footprint factor, not the ×20
 * of the structures: a 50 m hardstand is 0,4 km across, not a lily pad.
 */
export function pedestalGeometry(): THREE.BufferGeometry {
  const foot = new THREE.CylinderGeometry(0.075, 0.09, 0.04, 12, 1, false);
  foot.translate(0, 0.02, 0);
  const pad = new THREE.CylinderGeometry(0.2, 0.21, 0.012, 16, 1, false);
  pad.translate(0, 0.006, 0);
  return merged([paint(foot, CONCRETE), paint(pad, [0.5, 0.48, 0.44])]);
}

/** NACA 00xx half-thickness at chord fraction s, for a unit thickness ratio. */
function halfThickness(s: number): number {
  const r = Math.sqrt(Math.max(0, s));
  return 5 * (0.2969 * r - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Piecewise-linear blade planform: chord and thickness ratio along the span. */
function chordAt(t: number): number {
  return t < 0.22 ? lerp(0.06, 0.085, t / 0.22) : lerp(0.085, 0.016, (t - 0.22) / 0.78);
}
function thicknessAt(t: number): number {
  return t < 0.22 ? lerp(1, 0.32, t / 0.22) : lerp(0.32, 0.13, (t - 0.22) / 0.78);
}

/**
 * One blade along +Y from the spinner to ROTOR_RADIUS_KM. The rotor turns
 * +Y → +X (clockwise seen from upwind — the viewer at +Z looking down −Z
 * has +X on the right), so the leading edge sits on the +X side; the twist
 * (13° at the root) turns the leading edge upwind (+Z) as on a real blade.
 * Coned and pre-bent toward the wind so the tips clear the tower.
 * `pitchDeg` adds the collective pitch: ≈ 86° feathers the blade edge-on to
 * the wind — the storm silhouette of docs/08 §3.
 */
function bladeGeometry(pitchDeg: number): THREE.BufferGeometry {
  const SECTIONS = 12;
  const POINTS = 14;
  const rootR = 0.05;
  const cone = 4 * DEG;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const t = s / (SECTIONS - 1);
    const r = lerp(rootR, ROTOR_RADIUS_KM, t);
    const chord = chordAt(t);
    const thick = thicknessAt(t);
    const twist = (13 * Math.pow(Math.max(0, 1 - t), 1.5) + pitchDeg) * DEG;
    const circle = 1 - Math.min(1, t / 0.18);
    const cy = r * Math.cos(cone);
    const cz = r * Math.sin(cone) + 0.05 * t * t;
    for (let p = 0; p < POINTS; p++) {
      const a = (p / POINTS) * Math.PI * 2;
      const sc = (1 - Math.cos(a)) / 2;
      const sign = a <= Math.PI ? 1 : -1;
      // Chord coordinate u runs from the leading edge (+0,3 c, on +X) to the
      // trailing edge (−0,7 c); the root blends into a circular flange.
      const au = (0.3 - sc) * chord;
      const av = sign * halfThickness(sc) * thick * chord;
      const cu = Math.cos(a) * (chord / 2);
      const cv = Math.sin(a) * (chord / 2);
      const u = lerp(au, cu, circle);
      const v = lerp(av, cv, circle);
      // Rotation about the span axis that carries the leading edge toward +Z.
      const x = u * Math.cos(twist) - v * Math.sin(twist);
      const z = u * Math.sin(twist) + v * Math.cos(twist);
      positions.push(x, cy, cz + z);
    }
  }
  for (let s = 0; s < SECTIONS - 1; s++) {
    for (let p = 0; p < POINTS; p++) {
      const a = s * POINTS + p;
      const b = s * POINTS + ((p + 1) % POINTS);
      const c = (s + 1) * POINTS + ((p + 1) % POINTS);
      const d = (s + 1) * POINTS + p;
      indices.push(a, b, c, a, c, d);
    }
  }
  // Caps: a fan at the root and at the tip.
  const capCentre = (s: number): number => {
    const base = s * POINTS;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let p = 0; p < POINTS; p++) {
      x += positions[(base + p) * 3]!;
      y += positions[(base + p) * 3 + 1]!;
      z += positions[(base + p) * 3 + 2]!;
    }
    positions.push(x / POINTS, y / POINTS, z / POINTS);
    return positions.length / 3 - 1;
  };
  const root = capCentre(0);
  for (let p = 0; p < POINTS; p++) indices.push(root, (p + 1) % POINTS, p);
  const tip = capCentre(SECTIONS - 1);
  const tipBase = (SECTIONS - 1) * POINTS;
  for (let p = 0; p < POINTS; p++) indices.push(tip, tipBase + p, tipBase + ((p + 1) % POINTS));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The rotor about its hub centre: spinner plus three blades, running
 * (pitch 0) or feathered (pitch 86°).
 */
export function rotorGeometry(feathered: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spinner = new THREE.SphereGeometry(0.058, 12, 8);
  spinner.scale(1, 1, 1.6);
  spinner.translate(0, 0, 0.035);
  parts.push(paint(spinner, WHITE));
  const blade = bladeGeometry(feathered ? 86 : 0);
  for (let i = 0; i < 3; i++) {
    const copy = blade.clone();
    copy.rotateZ((i * 2 * Math.PI) / 3);
    parts.push(paint(copy, WHITE));
  }
  blade.dispose();
  return merged(parts);
}

/** A translucent disc the size of the rotor, in the nacelle's frame. */
export function discGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CircleGeometry(ROTOR_RADIUS_KM, 36);
  disc.translate(0, 0, HUB_OFFSET_KM);
  disc.deleteAttribute("uv");
  return disc;
}

/**
 * Offshore foundation at the site, origin at sea level: monopile into the
 * seabed, rust-dark splash zone, yellow transition piece with its platform,
 * a boat landing on the +Z side.
 */
export function foundationGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pile = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 12, 1, false);
  pile.translate(0, -0.65, 0);
  parts.push(paint(pile, PILE));
  const splash = new THREE.CylinderGeometry(0.072, 0.072, 0.2, 12, 1, false);
  splash.translate(0, 0.05, 0);
  parts.push(paint(splash, SPLASH));
  const tp = new THREE.CylinderGeometry(0.078, 0.078, 0.28, 12, 1, false);
  tp.translate(0, 0.26, 0);
  parts.push(paint(tp, YELLOW));
  const platform = new THREE.CylinderGeometry(0.15, 0.15, 0.015, 12, 1, false);
  platform.translate(0, TP_TOP_KM - 0.0075, 0);
  parts.push(paint(platform, YELLOW));
  for (const x of [-0.035, 0.035]) {
    const fender = new THREE.CylinderGeometry(0.007, 0.007, 0.5, 6, 1, false);
    fender.translate(x, 0.1, 0.1);
    parts.push(paint(fender, DARK));
  }
  const ladder = new THREE.BoxGeometry(0.05, 0.45, 0.01);
  ladder.translate(0, 0.14, 0.098);
  parts.push(paint(ladder, DARK));
  return merged(parts);
}

/**
 * Onshore collector substation at the farm's hex centre: the control
 * building, two transformers and the line-landing portal.
 */
export function substationGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const building = new THREE.BoxGeometry(0.34, HEIGHT_KM.container, 0.22);
  building.translate(-0.12, HEIGHT_KM.container / 2, 0.16);
  parts.push(paint(building, [0.78, 0.77, 0.74]));
  for (const x of [0.1, 0.32]) {
    const transformer = new THREE.BoxGeometry(0.14, 0.16, 0.12);
    transformer.translate(x, 0.08, 0.16);
    parts.push(paint(transformer, [0.3, 0.36, 0.34]));
  }
  for (const x of [-0.3, 0.3]) {
    const post = new THREE.CylinderGeometry(0.012, 0.014, HEIGHT_KM.portal, 6, 1);
    post.translate(x, HEIGHT_KM.portal / 2, -0.2);
    parts.push(paint(post, [0.55, 0.56, 0.58]));
  }
  const beam = new THREE.BoxGeometry(0.66, 0.03, 0.03);
  beam.translate(0, HEIGHT_KM.portal - 0.015, -0.2);
  parts.push(paint(beam, [0.55, 0.56, 0.58]));
  const yard = new THREE.BoxGeometry(0.9, 0.02, 0.7);
  yard.translate(0, 0.01, 0);
  parts.push(paint(yard, [0.5, 0.49, 0.46]));
  return merged(parts);
}

/** Offshore substation platform at the farm's hex centre, origin at sea level. */
export function platformGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.16, 0.16]) {
    for (const z of [-0.12, 0.12]) {
      const leg = new THREE.CylinderGeometry(0.045, 0.045, 1.5, 8, 1, false);
      leg.translate(x, -0.25, z);
      parts.push(paint(leg, YELLOW));
    }
  }
  const deck = new THREE.BoxGeometry(0.5, 0.04, 0.4);
  deck.translate(0, 0.52, 0);
  parts.push(paint(deck, DARK));
  const topside = new THREE.BoxGeometry(0.44, 0.26, 0.34);
  topside.translate(0, 0.67, 0);
  parts.push(paint(topside, [0.72, 0.72, 0.7]));
  const helideck = new THREE.CylinderGeometry(0.13, 0.13, 0.01, 12, 1, false);
  helideck.translate(0.16, 0.805, 0.1);
  parts.push(paint(helideck, [0.25, 0.3, 0.28]));
  return merged(parts);
}
