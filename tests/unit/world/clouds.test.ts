// The cloud setting (docs/08 §3, §6): PEŁNE draws the layer over the whole
// country, PRZEJRZYSTE parts it over the board — only the shadows cross the
// hexes, the layer closes again in a ring outside them — and BRAK draws
// neither. A view preference: the default keeps the map readable, and a
// capture pins it by URL like every other setting.

import type * as THREE from "three";
import { describe, expect, test } from "vitest";
import { parseCaptureParams } from "../../../src/world/capture/params";
import { defaultSettings } from "../../../src/world/hud/settingsStore";
import { CloudLayers } from "../../../src/world/render/sky/Clouds";

const BOARD = [-14.4, -12.5, 512.9, 400] as const;

function layersIn(mode: "full" | "clear" | "none", tierLayers: 1 | 2 = 2) {
  const layers = new CloudLayers();
  layers.configure(tierLayers, true);
  layers.setBoard(...BOARD);
  layers.setMode(mode);
  const meshes = layers.group.children as THREE.Mesh[];
  return {
    layers,
    visible: meshes.map((mesh) => mesh.visible),
    uniforms: meshes.map((mesh) => (mesh.material as THREE.ShaderMaterial).uniforms),
  };
}

describe("cloud setting", () => {
  test("the clouds keep off the map unless the player asks for them", () => {
    expect(defaultSettings().clouds).toBe("clear");
  });

  test("PRZEJRZYSTE parts both layers over the board rectangle", () => {
    const { visible, uniforms } = layersIn("clear");
    expect(visible).toEqual([true, true]);
    for (const u of uniforms) {
      expect(u.uClear!.value).toBe(1);
      expect((u.uBoard!.value as THREE.Vector4).toArray()).toEqual([...BOARD]);
    }
  });

  test("PEŁNE covers the board again", () => {
    const { visible, uniforms } = layersIn("full");
    expect(visible).toEqual([true, true]);
    expect(uniforms.map((u) => u.uClear!.value)).toEqual([0, 0]);
  });

  test("BRAK hides both layers, and a tier change does not bring one back", () => {
    const { layers, visible } = layersIn("none");
    expect(visible).toEqual([false, false]);

    layers.configure(2, true);
    expect(layers.group.children.map((mesh) => mesh.visible)).toEqual([false, false]);

    layers.setMode("full");
    expect(layers.group.children.map((mesh) => mesh.visible)).toEqual([true, true]);
  });

  test("a one-layer tier keeps its single layer in every mode but BRAK", () => {
    expect(layersIn("full", 1).visible).toEqual([true, false]);
    expect(layersIn("clear", 1).visible).toEqual([true, false]);
    expect(layersIn("none", 1).visible).toEqual([false, false]);
  });

  test("a capture pins the setting by URL; anything else keeps the player's", () => {
    expect(parseCaptureParams("?clouds=full").clouds).toBe("full");
    expect(parseCaptureParams("?clouds=clear").clouds).toBe("clear");
    expect(parseCaptureParams("?clouds=none").clouds).toBe("none");
    expect(parseCaptureParams("?clouds=gęste").clouds).toBeNull();
    expect(parseCaptureParams("").clouds).toBeNull();
  });
});
