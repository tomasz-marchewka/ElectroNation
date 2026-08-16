// The map renderer: a MapScene in, one <svg> out. Adapted from
// design-system/components/map/HexMap.jsx — same layer order (biome fills →
// textures → lines → selection → rings → pads → icons → labels → overlays),
// same tokens, no animation (brand-motion).
//
// Everything that moves with the board sits in ONE transformed group
// (CLAUDE.md); the legends and the scale stay outside it, glued to the
// viewport. The viewBox is the measured pixel size of the region, so hexes are
// never stretched and the overlays keep their design geometry.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { LINE_TYPES, type HexCoord, type LineType } from "../../engine";
import { formatNumber } from "../format";
import { LINE_TYPE_LABELS } from "../labels";
import { BIOMES } from "./biomes";
import {
  HEX_PATH,
  LABEL_FONT_SIZE,
  LABEL_HALO,
  OVERLOAD_FONT_SIZE,
  drawnBounds,
  type Bounds,
  type Point,
  type Size,
} from "./geometry";
import { biomeTexture, iconColor, objectIcon } from "./icons";
import type {
  LineLoad,
  MapObjectRing,
  MapScene,
  MapSceneHex,
  MapSceneLabel,
  MapSceneObject,
} from "./sceneModel";
import { ZOOM_STEP, clampView, fitView, panView, zoomView, type View } from "./view";

/** Viewport used before the region has been measured (the handoff's own). */
const DEFAULT_VIEWPORT: Size = { width: 1060, height: 640 };

/** Drag distance that turns a click into a pan [px]. */
const CLICK_SLOP = 4;

/** Line thickness codes the type; colour codes the load (brand-lines). */
const LINE_WIDTHS: Record<LineType, number> = { lv: 2.5, mv: 4, hv: 6 };

const LOAD_STROKES: Record<LineLoad, string> = {
  ok: "--en-ok",
  warn: "--en-warn",
  over: "--en-danger",
  idle: "--en-idle",
};

const RING_STROKES: Record<MapObjectRing, string> = {
  object: "--en-obj-ring",
  city: "--en-city-ring",
  alert: "--en-danger",
  planned: "--en-idle",
};

const RING_WIDTHS: Record<MapObjectRing, number> = { object: 2, city: 3, alert: 3, planned: 2 };

const LABEL_FILLS = {
  default: "--en-map-label",
  city: "--en-map-label-city",
  danger: "--en-danger-text",
} as const;

/** Legend chip spacing of the handoff, squeezed when the region is narrower. */
const LEGEND_STEP = 126;
const LEGEND_FIRST_X = 26;
const LEGEND_TEXT_DX = 15;
/** Room the last chip's own label needs: 14 mono characters at 10 px, plus air. */
const LEGEND_TEXT_RESERVE = 110;

/**
 * Line legend: the thickness scale of brand-lines, with the capacities read
 * from the engine (01 §4.2) instead of the handoff's typed-in numbers, so the
 * legend cannot drift away from what the lines actually carry.
 */
const LINE_LEGEND = (["lv", "mv", "hv"] as const).map((type, index) => ({
  type,
  y: index * 16 + 4,
  label: `${LINE_TYPE_LABELS[type]} ${formatNumber(LINE_TYPES[type].capacityMw)}`,
}));

/** Load legend of brand-lines: the three tones a live line can take. */
const LOAD_LEGEND = [
  { load: "ok", y: 4, label: "OK" },
  { load: "warn", y: 20, label: ">75%" },
  { load: "over", y: 36, label: "LIMIT" },
] as const;

function pointsAttr(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Live pixel size of an element. Falls back to the handoff's viewport where
 * there is nothing to measure (jsdom, first paint) so the scene still lays out.
 */
function useElementSize(target: { current: Element | null }): Size {
  const [size, setSize] = useState<Size>(DEFAULT_VIEWPORT);
  useEffect(() => {
    const node = target.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);
  return size;
}

export interface HexMapViewProps {
  scene: MapScene;
  /** Click on a hex — the hex panel follows in M7, selection is visual here. */
  onHexClick?: (hex: HexCoord) => void;
}

export function HexMapView({ scene, onHexClick }: HexMapViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewport = useElementSize(hostRef);

  // Labels reach past the board's edges, so the view works on what is actually
  // drawn — otherwise the text of an edge object could never be scrolled to.
  const content = useMemo(
    () => drawnBounds(scene.world, scene.labels, scene.overload),
    [scene.world, scene.labels, scene.overload],
  );

  // No view of its own until the player pans or zooms: the map opens on the
  // whole board and refits itself whenever the region is resized.
  const [view, setView] = useState<View | null>(null);
  const [panning, setPanning] = useState(false);
  const current = view === null ? fitView(content, viewport) : view;

  const stateRef = useRef({ view: current, content, viewport });
  stateRef.current = { view: current, content, viewport };

  /**
   * Applies a gesture to the CURRENT view, not the rendered one: several wheel
   * or move events can land in a single React batch, and each has to build on
   * the previous one or the gesture loses steps.
   */
  const applyGesture = useCallback(
    (gesture: (from: View, content: Bounds, viewport: Size) => View) => {
      const { view: rendered, content: box, viewport: frame } = stateRef.current;
      setView((pending) => gesture(pending ?? rendered, box, frame));
    },
    [],
  );

  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: number } | null>(null);
  const suppressClickRef = useRef(false);

  // Zoom needs a non-passive listener to keep the wheel off the page.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      applyGesture((from, box, frame) => zoomView(from, box, frame, factor, at));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyGesture]);

  // A resize can leave the board off-center; clamping keeps it in the frame.
  useEffect(() => {
    setView((from) => (from === null ? null : clampView(from, content, viewport)));
  }, [content, viewport]);

  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    suppressClickRef.current = false;
    setPanning(true);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      // A gesture that never crossed the slop holds no pointer capture, so a
      // button released off the map sends its `pointerup` elsewhere and the
      // drag would otherwise keep running with nothing pressed.
      if (event.buttons === 0) {
        dragRef.current = null;
        setPanning(false);
        return;
      }
      const by = { x: event.clientX - drag.x, y: event.clientY - drag.y };
      drag.x = event.clientX;
      drag.y = event.clientY;
      const wasClick = drag.moved <= CLICK_SLOP;
      drag.moved += Math.abs(by.x) + Math.abs(by.y);
      // The pointer is captured only once the gesture turns into a pan: a
      // capture retargets the click too, and the hex under it would never see it.
      if (wasClick && drag.moved > CLICK_SLOP) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      applyGesture((from, box, frame) => panView(from, box, frame, by));
    },
    [applyGesture],
  );

  const endPan = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // A pan that moved the board is not a click on the hex under the cursor.
    suppressClickRef.current = drag.moved > CLICK_SLOP;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPanning(false);
  }, []);

  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (suppressClickRef.current) return;
      onHexClick?.(hex);
    },
    [onHexClick],
  );

  const byBiome = useMemo(() => {
    const groups = new Map<string, MapSceneHex[]>();
    for (const hex of scene.hexes) {
      const group = groups.get(hex.biome);
      if (group) group.push(hex);
      else groups.set(hex.biome, [hex]);
    }
    return groups;
  }, [scene.hexes]);

  const { width, height } = viewport;
  const legendStep = Math.min(
    LEGEND_STEP,
    Math.max(
      0,
      (width - LEGEND_FIRST_X - LEGEND_TEXT_RESERVE) / Math.max(1, scene.biomeLegend.length - 1),
    ),
  );

  return (
    <div className="en-map" ref={hostRef}>
      <svg
        ref={svgRef}
        className={panning ? "en-map__canvas is-panning" : "en-map__canvas"}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <g transform={`translate(${current.x} ${current.y}) scale(${current.scale})`}>
          {BIOMES.map((biome) => {
            const hexes = byBiome.get(biome.slug);
            return hexes ? (
              <g
                key={biome.slug}
                fill={`var(--en-biome-${biome.slug}-fill)`}
                stroke={`var(--en-biome-${biome.slug}-edge)`}
                strokeWidth="1"
              >
                {hexes.map((hex) => (
                  <path
                    key={hex.key}
                    d={HEX_PATH}
                    transform={`translate(${hex.x} ${hex.y})`}
                    data-hex={hex.key}
                    data-selected={scene.selection?.key === hex.key ? "true" : undefined}
                    onClick={() => handleHexClick(hex.hex)}
                  />
                ))}
              </g>
            ) : null;
          })}

          {BIOMES.map((biome) => {
            const hexes = byBiome.get(biome.slug);
            const texture = biomeTexture(biome.slug);
            return hexes && texture ? (
              <g
                key={`tex-${biome.slug}`}
                fill={`var(--en-biome-${biome.slug}-tex)`}
                stroke={`var(--en-biome-${biome.slug}-tex)`}
                opacity="0.62"
                pointerEvents="none"
              >
                {hexes.map((hex) => (
                  <g key={hex.key} transform={`translate(${hex.x} ${hex.y})`}>
                    {texture}
                  </g>
                ))}
              </g>
            ) : null;
          })}

          <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
            {scene.lines.map((line) =>
              line.segments.map((segment) => (
                <polyline
                  key={segment.key}
                  data-line={line.id}
                  points={pointsAttr(segment.points)}
                  stroke={`var(${LOAD_STROKES[segment.load]})`}
                  strokeWidth={LINE_WIDTHS[line.type]}
                  strokeDasharray={segment.load === "idle" ? "4 4" : undefined}
                />
              )),
            )}
          </g>

          {scene.selection && (
            <path
              className="en-map__selection"
              d={HEX_PATH}
              transform={`translate(${scene.selection.x} ${scene.selection.y})`}
              fill="none"
              stroke="var(--en-action)"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}

          <g fill="none" pointerEvents="none">
            {scene.objects.map((object) => (
              <path
                key={object.id}
                d={HEX_PATH}
                transform={`translate(${object.x} ${object.y})`}
                stroke={`var(${RING_STROKES[object.ring]})`}
                strokeWidth={RING_WIDTHS[object.ring]}
              />
            ))}
          </g>
          <g fill="var(--en-map-pad)" opacity="var(--en-map-pad-opacity)" pointerEvents="none">
            {scene.objects.map((object) => (
              <circle key={object.id} cx={object.x} cy={object.y} r={padRadius(object)} />
            ))}
          </g>
          <g pointerEvents="none">
            {scene.objects.map((object) => (
              <g
                key={object.id}
                transform={`translate(${object.x} ${object.y})`}
                color={iconColor(object.kind)}
              >
                {objectIcon(object.kind)}
              </g>
            ))}
          </g>

          <g
            fontFamily="var(--en-font-mono)"
            fontSize={LABEL_FONT_SIZE}
            textAnchor="middle"
            paintOrder="stroke"
            stroke="var(--en-bg-map)"
            strokeWidth={LABEL_HALO}
            strokeLinejoin="round"
            pointerEvents="none"
          >
            {scene.labels.map((label) => (
              <text
                key={label.key}
                x={label.x}
                y={label.y}
                fill={`var(${LABEL_FILLS[label.tone]})`}
                fontWeight={labelWeight(label)}
              >
                {label.text}
              </text>
            ))}
          </g>

          {scene.overload && (
            <text
              className="en-map__overload"
              x={scene.overload.x}
              y={scene.overload.y}
              fill="var(--en-danger)"
              fontSize={OVERLOAD_FONT_SIZE}
              fontFamily="var(--en-font-mono)"
              fontWeight="600"
              paintOrder="stroke"
              stroke="var(--en-bg-map)"
              strokeWidth={LABEL_HALO}
              pointerEvents="none"
            >
              {scene.overload.text}
            </text>
          )}
        </g>

        {/* Overlays: outside the transform, glued to the viewport. */}
        <g pointerEvents="none">
          <rect x="0" y="0" width={width} height="34" fill="var(--en-bg-app)" opacity="0.9" />
          <g fontFamily="var(--en-font-mono)">
            {scene.biomeLegend.map((entry, index) => (
              <g key={entry.slug}>
                <path
                  d="M-9 0 L-4.5 -7.8 L4.5 -7.8 L9 0 L4.5 7.8 L-4.5 7.8 Z"
                  transform={`translate(${LEGEND_FIRST_X + index * legendStep} 17)`}
                  fill={`var(--en-biome-${entry.slug}-fill)`}
                  stroke={`var(--en-biome-${entry.slug}-edge)`}
                  strokeWidth="1.2"
                />
                <text
                  x={LEGEND_FIRST_X + LEGEND_TEXT_DX + index * legendStep}
                  y="21"
                  fontSize="10"
                  fill="var(--en-map-label)"
                >
                  {entry.label}
                </text>
              </g>
            ))}
          </g>

          <rect
            x="8"
            y={height - 64}
            width="176"
            height="56"
            fill="var(--en-bg-app)"
            opacity="0.9"
          />
          <g
            transform={`translate(20 ${height - 48})`}
            fontFamily="var(--en-font-mono)"
            fontSize="9.5"
            fill="var(--en-map-label)"
          >
            {LINE_LEGEND.map((entry) => (
              <g key={entry.type}>
                <path
                  d={`M0 ${entry.y} L26 ${entry.y}`}
                  stroke="var(--en-idle)"
                  strokeWidth={LINE_WIDTHS[entry.type]}
                />
                <text x="32" y={entry.y + 4}>
                  {entry.label}
                </text>
              </g>
            ))}
            {LOAD_LEGEND.map((entry) => (
              <g key={entry.load}>
                <circle cx="96" cy={entry.y} r="4" fill={`var(${LOAD_STROKES[entry.load]})`} />
                <text x="106" y={entry.y + 4}>
                  {entry.label}
                </text>
              </g>
            ))}
          </g>

          <text
            x={width - 16}
            y={height - 12}
            textAnchor="end"
            fontFamily="var(--en-font-mono)"
            fontSize="10"
            fill="var(--en-map-scale)"
          >
            {scene.scaleLabel}
          </text>
        </g>
      </svg>
    </div>
  );
}

/** The handoff pads a city wider than everything else. */
function padRadius(object: MapSceneObject): number {
  return object.kind === "city" ? 19 : 17;
}

function labelWeight(label: MapSceneLabel): number {
  return label.tone === "default" ? 400 : 600;
}
