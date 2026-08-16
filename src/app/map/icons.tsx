// Object icons and biome textures, ported from the design handoff
// (HexMap.jsx `ICONS` / `TEX`) into JSX — same paths, same stroke widths, no
// dangerouslySetInnerHTML. Icons are drawn in `currentColor`, so the renderer
// picks the technology colour once, on the group around them.

import type { ReactElement } from "react";
import type { BiomeSlug } from "./biomes";
import type { MapObjectKind } from "./sceneModel";

/**
 * Technology colour of every icon. The set is closed — a new object type means
 * a new line icon, never an icon library (brand-objects).
 *
 * `nuclear` is an addition: doc 01 §5.1 has the technology, the handoff has no
 * icon and no colour for it. It stays on the neutral `--en-text` the handoff
 * itself falls back to, because every coloured token is already taken and
 * `--en-info` explicitly means weather/renewables (handoff README). A dedicated
 * `--en-nuclear-ico` token is a question for the designer.
 */
const ICON_COLORS: Record<MapObjectKind, string> = {
  nuclear: "--en-text",
  coal: "--en-coal-ico",
  gas: "--en-gas-ico",
  wind: "--en-wind",
  pv: "--en-pv",
  bess: "--en-ok",
  node: "--en-info",
  city: "--en-map-label-city",
  town: "--en-map-label-city",
  border: "--en-storage",
};

export function iconColor(kind: MapObjectKind): string {
  return `var(${ICON_COLORS[kind]})`;
}

/**
 * `nuclear`: containment dome on a base line with the core marked — line work
 * of 2 px inside the same ⌀34 px as the rest of the set.
 */
const ICONS: Record<MapObjectKind, ReactElement> = {
  nuclear: (
    <>
      <path
        d="M-13 8 H13 M-11 8 A11 11 0 0 1 11 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="0" cy="3" r="2.5" fill="currentColor" />
    </>
  ),
  coal: (
    <>
      <rect
        x="-12"
        y="-4"
        width="24"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="4" y="-14" width="5" height="10" fill="currentColor" />
    </>
  ),
  gas: (
    <>
      <rect
        x="-11"
        y="-3"
        width="22"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M-4 -8 L0 -14 L4 -8 Z" fill="currentColor" />
    </>
  ),
  wind: (
    <>
      <path
        d="M0 2 L0 -14 M0 2 L13 9 M0 2 L-13 9"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
      <circle cx="0" cy="2" r="2.5" fill="currentColor" />
    </>
  ),
  pv: (
    <>
      <rect
        x="-11"
        y="-7"
        width="22"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M-11 0 L11 0 M-3.7 -7 L-3.7 7 M3.7 -7 L3.7 7"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </>
  ),
  bess: (
    <>
      <rect
        x="-10"
        y="-6"
        width="20"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="10" y="-3" width="3" height="6" fill="currentColor" />
      <rect x="-8" y="-4" width="11" height="8" fill="currentColor" opacity="0.5" />
    </>
  ),
  node: (
    <g transform="rotate(45)">
      <rect
        x="-8"
        y="-8"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </g>
  ),
  city: (
    <>
      <rect x="-14" y="-4" width="7" height="13" fill="currentColor" />
      <rect x="-4" y="-11" width="8" height="20" fill="currentColor" />
      <rect x="7" y="-6" width="6" height="15" fill="currentColor" />
    </>
  ),
  town: (
    <>
      <rect x="-11" y="-3" width="6" height="12" fill="currentColor" />
      <rect x="-2" y="-9" width="7" height="18" fill="currentColor" />
    </>
  ),
  border: (
    <path
      d="M-9 -6 L-1 0 L-9 6 M3 -6 L11 0 L3 6"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
  ),
};

export function objectIcon(kind: MapObjectKind): ReactElement {
  return ICONS[kind];
}

/** Relief marks of a biome; plains carry none. Colours come from the group. */
const WATER_TEXTURE = (
  <>
    <path d="M-17 8 q6 -4 11 0 t11 0" fill="none" strokeWidth="1.6" />
    <path d="M-14 16 q6 -4 11 0 t11 0" fill="none" strokeWidth="1.6" />
  </>
);

const TEXTURES: Partial<Record<BiomeSlug, ReactElement>> = {
  gory: (
    <>
      <path d="M-21 13 l8 -13 l8 13 z" />
      <path d="M3 13 l6 -9 l6 9 z" />
    </>
  ),
  wyzyna: (
    <>
      <path d="M-15 12 q7 -7 14 0" fill="none" strokeWidth="1.6" />
      <path d="M2 15 q6 -5 12 0" fill="none" strokeWidth="1.6" />
    </>
  ),
  las: (
    <>
      <path d="M-18 15 l4 -10 l4 10 z" />
      <path d="M-5 16 l4.5 -11 l4.5 11 z" />
      <path d="M9 15 l4 -10 l4 10 z" />
    </>
  ),
  bagno: (
    <path d="M-16 9 h11 M0 9 h11 M-9 15 h11" fill="none" strokeWidth="1.8" strokeLinecap="round" />
  ),
  jezioro: WATER_TEXTURE,
  morze: WATER_TEXTURE,
  miasto: (
    <>
      <rect x="-16" y="6" width="5" height="9" />
      <rect x="-8" y="2" width="6" height="13" />
      <rect x="1" y="8" width="5" height="7" />
      <rect x="9" y="4" width="5" height="11" />
    </>
  ),
};

export function biomeTexture(biome: BiomeSlug): ReactElement | null {
  return TEXTURES[biome] ?? null;
}
