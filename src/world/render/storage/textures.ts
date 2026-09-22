// Procedural surfaces for the storage layer (ARCHITECTURE.md §14): every
// texture comes from render/core/textures.ts seeded at fixed stream names, so
// nothing is downloaded and every session paints the same pixels. Only the
// surfaces the brief names: concrete, rock fill (dam), dark wet basin rock,
// gravel (BESS pad), steel, corrugated container paint with a louvred vent
// grille, the penstock metal, a wave normal for the reservoir and a foam mask.

import * as THREE from "three";
import { normalMapFromHeight, proceduralTexture } from "../core/textures";

export interface StorageTextures {
  concrete: THREE.DataTexture;
  concreteNormal: THREE.DataTexture;
  gravel: THREE.DataTexture;
  gravelNormal: THREE.DataTexture;
  rockFill: THREE.DataTexture;
  rockFillNormal: THREE.DataTexture;
  basinRock: THREE.DataTexture;
  basinNormal: THREE.DataTexture;
  containerPaint: THREE.DataTexture;
  containerNormal: THREE.DataTexture;
  vent: THREE.DataTexture;
  steel: THREE.DataTexture;
  steelNormal: THREE.DataTexture;
  waterNormal: THREE.DataTexture;
  foam: THREE.DataTexture;
}

let cache: StorageTextures | null = null;

export function storageTextures(): StorageTextures {
  if (cache) return cache;

  // Concrete: weathered light grey, rain streaks and damp blotches.
  const concrete = proceduralTexture({
    name: "storage:concrete",
    size: 256,
    fields: {
      grain: { lattice: 32, octaves: 3 },
      blotch: { lattice: 5, octaves: 4 },
      streak: { lattice: 3, octaves: 3 },
    },
    pixel(u, v, f) {
      const grain = f.grain?.at(u * 8, v * 8) ?? 0.5;
      const blotch = f.blotch?.at(u, v) ?? 0.5;
      const streak = f.streak?.at(u * 1.5, v * 0.25) ?? 0.5;
      const run = Math.max(0, 1 - Math.abs(v - streak * 0.9) * 6) * (1 - v) * 0.5;
      const value = 0.68 + 0.16 * (grain - 0.5) - 0.18 * blotch - 0.1 * run;
      return [value, value * 0.995, value * 0.97];
    },
  });
  const concreteNormal = normalMapFromHeight(
    "storage:concrete-normal",
    128,
    (u, v, f) =>
      (f.grain?.at(u * 8, v * 8) ?? 0.5) * 0.5 + (f.blotch?.at(u * 2, v * 2) ?? 0.5) * 0.5,
    { grain: { lattice: 32, octaves: 3 }, blotch: { lattice: 5, octaves: 3 } },
    0.7,
  );

  // Gravel yard: warm grey crushed stone, the BESS pad.
  const gravel = proceduralTexture({
    name: "storage:gravel",
    size: 256,
    fields: {
      pebble: { lattice: 48, octaves: 2 },
      patch: { lattice: 6, octaves: 3 },
      dust: { lattice: 24, octaves: 2 },
    },
    pixel(u, v, f) {
      const pebble = f.pebble?.at(u * 14, v * 14) ?? 0.5;
      const patch = f.patch?.at(u, v) ?? 0.5;
      const dust = f.dust?.at(u * 4, v * 4) ?? 0.5;
      const value = 0.5 + 0.22 * (pebble - 0.5) + 0.08 * (dust - 0.5) + 0.06 * (patch - 0.5);
      return [value * 1.04, value * 0.98, value * 0.9];
    },
  });
  const gravelNormal = normalMapFromHeight(
    "storage:gravel-normal",
    128,
    (u, v, f) => f.pebble?.at(u * 14, v * 14) ?? 0.5,
    { pebble: { lattice: 48, octaves: 2 } },
    1.6,
  );

  // Rock fill of the dam face: coarse grey-brown rubble, strong relief.
  const rockFill = proceduralTexture({
    name: "storage:rock-fill",
    size: 256,
    fields: {
      rubble: { lattice: 40, octaves: 3 },
      patch: { lattice: 5, octaves: 3 },
      moss: { lattice: 8, octaves: 3 },
    },
    pixel(u, v, f) {
      const rubble = f.rubble?.at(u * 16, v * 16) ?? 0.5;
      const patch = f.patch?.at(u, v) ?? 0.5;
      const moss = f.moss?.at(u * 3, v * 3) ?? 0.5;
      const shade = 0.5 + 0.32 * (rubble - 0.5) + 0.12 * (patch - 0.5);
      const green = Math.max(0, moss - 0.6) * 0.4;
      return [shade * 1.02 - green * 0.2, shade - green * 0.05, shade * 0.94 + green * 0.05];
    },
  });
  const rockFillNormal = normalMapFromHeight(
    "storage:rock-fill-normal",
    128,
    (u, v, f) =>
      (f.rubble?.at(u * 16, v * 16) ?? 0.5) * 0.7 + (f.patch?.at(u * 3, v * 3) ?? 0.5) * 0.3,
    { rubble: { lattice: 40, octaves: 3 }, patch: { lattice: 5, octaves: 2 } },
    1.8,
  );

  // Basin rock: darker, wetter, finer than the fill — the inner slope.
  const basinRock = proceduralTexture({
    name: "storage:basin-rock",
    size: 256,
    fields: {
      grain: { lattice: 40, octaves: 3 },
      damp: { lattice: 6, octaves: 3 },
    },
    pixel(u, v, f) {
      const grain = f.grain?.at(u * 12, v * 12) ?? 0.5;
      const damp = f.damp?.at(u, v) ?? 0.5;
      const value = 0.44 + 0.22 * (grain - 0.5) + 0.08 * (damp - 0.5);
      return [value * 1.02, value, value * 0.96];
    },
  });
  const basinNormal = normalMapFromHeight(
    "storage:basin-rock-normal",
    128,
    (u, v, f) =>
      (f.grain?.at(u * 12, v * 12) ?? 0.5) * 0.6 + (f.damp?.at(u * 2, v * 2) ?? 0.5) * 0.4,
    { grain: { lattice: 40, octaves: 3 }, damp: { lattice: 6, octaves: 2 } },
    1.2,
  );

  // Container paint: plain manufacturer white-grey with vertical corrugation,
  // panel seams and grime at the base; hue is per-instance.
  const containerPaint = proceduralTexture({
    name: "storage:container-paint",
    size: 256,
    fields: { grime: { lattice: 8, octaves: 3 }, scuff: { lattice: 30, octaves: 2 } },
    pixel(u, v, f) {
      const ribs = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 22);
      const grime = f.grime?.at(u * 2, v * 2) ?? 0.5;
      const scuff = f.scuff?.at(u * 6, v * 6) ?? 0.5;
      const seam = Math.max(0, 1 - Math.abs(((u * 6) % 1) - 0.5) * 12);
      const base = 0.76 + 0.18 * (ribs - 0.5) - 0.1 * Math.max(0, v - 0.7) * grime;
      const value = base - 0.13 * seam - 0.06 * scuff;
      return [value, value * 0.995, value * 0.99];
    },
  });
  const containerNormal = normalMapFromHeight(
    "storage:container-normal",
    128,
    (u, v, f) =>
      0.5 +
      0.5 * Math.sin(u * Math.PI * 2 * 22) * 0.8 +
      (f.grime?.at(u * 2, v * 2) ?? 0.5) * 0.2 +
      Math.max(0, 1 - Math.abs(((u * 6) % 1) - 0.5) * 12) * 0.25,
    { grime: { lattice: 8, octaves: 2 } },
    1.4,
  );

  // Container detail atlas: the top half is the louvred vent grille, the
  // bottom half the dark end door with its handle, so one texture and one
  // instanced mesh carry both panels (see ventGeometry's UV split).
  const vent = proceduralTexture({
    name: "storage:vent",
    size: 128,
    fields: { dust: { lattice: 10, octaves: 2 } },
    pixel(u, v, f) {
      const dust = f.dust?.at(u * 4, v * 4) ?? 0.5;
      if (v >= 0.5) {
        // Door panel: dark, with a recessed edge and a vertical handle.
        const edge = Math.min(u, 1 - u, (v - 0.5) * 2, 1 - (v - 0.5) * 2) < 0.05 ? 1 : 0;
        const handle =
          Math.max(0, 1 - Math.abs(u - 0.82) * 22) * Math.max(0, 1 - Math.abs(v - 0.75) * 5);
        const d = 0.2 + 0.14 * edge + 0.5 * handle + 0.05 * (dust - 0.5);
        return [d * 0.98, d, d * 1.05];
      }
      const slat = v * 2 * 14;
      const line = Math.abs((slat % 1) - 0.5);
      const louvre = 1 - Math.max(0, 1 - line * 3);
      const frame = Math.min(u, 1 - u, v * 2, 1 - v * 2) < 0.06 ? 1 : 0;
      const d = 0.16 + 0.34 * Math.max(frame, louvre * 0.45) + 0.06 * (dust - 0.5);
      return [d, d * 1.01, d * 1.03];
    },
  });

  // Penstock / steelwork: cool blue-grey, brushed, with faint weld rings.
  const steel = proceduralTexture({
    name: "storage:steel",
    size: 128,
    fields: { brush: { lattice: 40, octaves: 3 }, stain: { lattice: 8, octaves: 3 } },
    pixel(u, v, f) {
      const brush = f.brush?.at(u * 20, v * 2) ?? 0.5;
      const stain = f.stain?.at(u * 2, v * 2) ?? 0.5;
      const weld = Math.max(0, 1 - Math.abs(((u * 3) % 1) - 0.5) * 10) * 0.12;
      const value = 0.56 + 0.14 * (brush - 0.5) - 0.1 * stain + weld;
      return [value * 0.94, value * 0.98, value];
    },
  });
  const steelNormal = normalMapFromHeight(
    "storage:steel-normal",
    128,
    (u, v, f) =>
      (f.brush?.at(u * 20, v * 2) ?? 0.5) * 0.4 +
      Math.max(0, 1 - Math.abs(((u * 3) % 1) - 0.5) * 10) * 0.5,
    { brush: { lattice: 40, octaves: 2 } },
    0.8,
  );

  // Reservoir waves: a tileable normal from cross-scrolled sine trains.
  const waterNormal = normalMapFromHeight(
    "storage:water-normal",
    256,
    (u, v, f) => {
      const a = Math.sin(u * Math.PI * 2 * 3 + (f.swell?.at(u * 2, v * 2) ?? 0.5) * 6);
      const b = Math.sin(v * Math.PI * 2 * 5 + (f.chop?.at(u * 4, v * 4) ?? 0.5) * 8);
      const c = f.chop?.at(u * 6, v * 6) ?? 0.5;
      return 0.5 + 0.25 * a + 0.18 * b + 0.2 * (c - 0.5);
    },
    { swell: { lattice: 4, octaves: 2 }, chop: { lattice: 12, octaves: 3 } },
    1.1,
  );

  // Foam mask: white water as an alpha texture (tailrace, outfall).
  const foam = proceduralTexture({
    name: "storage:foam",
    size: 256,
    fields: { lace: { lattice: 24, octaves: 4 }, body: { lattice: 6, octaves: 3 } },
    pixel(u, v, f) {
      const lace = f.lace?.at(u * 8, v * 8) ?? 0.5;
      const body = f.body?.at(u * 2, v * 2) ?? 0.5;
      const value = Math.min(1, Math.max(0, (lace * 0.7 + body * 0.5 - 0.32) * 2.4));
      return [value, value, value];
    },
  });

  cache = {
    concrete,
    concreteNormal,
    gravel,
    gravelNormal,
    rockFill,
    rockFillNormal,
    basinRock,
    basinNormal,
    containerPaint,
    containerNormal,
    vent,
    steel,
    steelNormal,
    waterNormal,
    foam,
  };
  return cache;
}
