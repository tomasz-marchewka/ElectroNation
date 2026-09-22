// World-anchored labels (docs/08 §7, ARCHITECTURE.md §3): the map's texts
// projected onto the objects they belong to, every frame, with a halo and a
// scrim so they read on a snow field at noon and on a black map at 03:00.
//
// React owns the list of nodes and nothing else. Positions, sizes, leaders
// and emphasis are written straight to the DOM from a frame loop that does
// all its reads (the HUD surfaces, the camera) before its writes and touches
// a node only when something about it changed — a still camera costs nothing.
// The placement rules live in ./labelLayout (pure); the text grammar in
// ./labelParts. Every number on screen is the bridge's own text.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { LabelKind, WorldLabel, WorldScene } from "../bridge/worldScene";
import { HEX_RADIUS_KM, hexToWorld } from "../render/core/units";
import type { WorldRenderer } from "../render/core/WorldRenderer";
import { layoutLabels, type LabelInput, type Rect } from "./labelLayout";
import { labelIdle, labelKindOf, labelParts } from "./labelParts";

const DEG = Math.PI / 180;

/** Depth thresholds [km] of the size tiers, far to near: tier 0 beyond the first. */
const TIER_DEPTH_KM = [380, 160, 70] as const;
/**
 * Font size of each tier [px] — the same numbers as hud.css `.is-d0` … `.is-d3`;
 * tier 0 is the design's map-label size (--en-fs-tiny). Boxes are measured
 * once at tier 1 and scaled from there.
 */
const TIER_FONT_PX = [10.5, 11.5, 13, 14] as const;
/**
 * Opacity of each tier: the farther the object, the quieter its chip, so the
 * near labels stay the ones that read first. Alerts never fade.
 */
const TIER_OPACITY = [0.88, 0.95, 1, 1] as const;
const BASE_TIER = 1;
/** Beyond this camera distance the technology suffix folds away — names and numbers stay. */
const COMPACT_DISTANCE_KM = 320;
/** Names fade gently past the strategic distance; alerts never fade. */
const NEAR_KM = 950;
const FAR_KM = 1500;
const FAR_OPACITY = 0.78;
/** A city off the grid: dimmed with its object, still readable. */
const MUTED_OPACITY = 0.72;
/** Height of an "above" anchor over the ground [km] — the top of the object (exaggeration table). */
const LIFT_KM: Record<LabelKind, number> = {
  city: 0,
  object: 0,
  site: 1.4,
  overload: 1.6,
  shortfall: 1.3,
  route: 0.6,
  line: 1.4,
};
/** Never culled, always led to their object. */
const ALERT_KINDS: ReadonlySet<LabelKind> = new Set(["overload", "shortfall", "route"]);
/** The shell — labels never sit under it, objects under it keep quiet (docs/08 §7). */
const HARD_OCCLUDER_SELECTORS = [
  ".en-topbar",
  ".en-panel",
  ".en-reportdock",
  ".en-timeline",
  ".en-chartlegend",
  ".en-report",
];
/** Object labels the dispatcher needs (junctions included) are searched outward rather than dropped. */
const LED_MIN_PRIORITY = 1;
/** Direction of an anchor outside the viewport, as a class on the label. */
const EDGE_CLASS = ["is-edge-up", "is-edge-right", "is-edge-down", "is-edge-left"] as const;
/** The world strips — labels are pushed out from under them and led back. */
const SOFT_OCCLUDER_SELECTORS = [".en-weather", ".en-diagnostics", ".en-worldlegend"];
/** Frames between two measurements of the HUD surfaces when nothing flagged a change. */
const OCCLUDER_REFRESH_FRAMES = 30;
/** Share of the projected hex radius a "below" label steps down from the centre. */
const FOOTPRINT_SHARE = 0.62;
/** Keep-out from the viewport border when an unprojectable anchor is placed [px]. */
const MARGIN_EDGE = 24;
/** How far past that border the synthetic anchor sits, so the chip clamps to it [px]. */
const EDGE_OVERSHOOT_PX = 48;

interface LabelNode {
  el: HTMLSpanElement;
  /**
   * Box at the base tier, measured once per text: full width, the tech
   * suffix's share, the width of the micro form (kind glyph + values, no
   * name) and the height.
   */
  base: { width: number; techWidth: number; microWidth: number; height: number } | null;
  /** Folds to its micro form at the far tier: a site, an idle plant, a farm at ~0. */
  micro: boolean;
  /** Not dropped for lack of room (labelLayout `led`). */
  led: boolean;
  /** Last written values — a write happens only on a change. */
  cache: { transform: string; opacity: string; className: string; lead: string };
}

/** Debug view of the last placement (dev builds only): what went in, what came out. */
interface LabelsDebug {
  compact: boolean;
  distanceKm: number;
  hard: Rect[];
  soft: Rect[];
  inputs: LabelInput[];
  placements: ReturnType<typeof layoutLabels>;
  /** Milliseconds the whole label frame took (reads, layout, writes). */
  frameMs: number;
  layoutMs: number;
  /** Labels on screen against labels with a visible anchor. */
  placed: number;
  total: number;
  /** Keys of labels with a visible anchor that found no room. */
  culled: string[];
}

function tierOf(depthKm: number): number {
  let tier = 0;
  for (const threshold of TIER_DEPTH_KM) if (depthKm < threshold) tier += 1;
  return tier;
}

function tierScale(tier: number): number {
  return (TIER_FONT_PX[tier] ?? TIER_FONT_PX[BASE_TIER]) / TIER_FONT_PX[BASE_TIER];
}

function fadeOf(depthKm: number): number {
  const t = Math.min(1, Math.max(0, (depthKm - NEAR_KM) / (FAR_KM - NEAR_KM)));
  return 1 - t * (1 - FAR_OPACITY);
}

function emptyCache(): LabelNode["cache"] {
  return { transform: "", opacity: "", className: "", lead: "" };
}

export interface WorldLabelsProps {
  renderer: WorldRenderer | null;
  scene: WorldScene;
}

export function WorldLabels({ renderer, scene }: WorldLabelsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(new Map<string, LabelNode>());
  /** Set by anything that invalidates the last frame's placement. */
  const forceRef = useRef(true);
  const selectionRef = useRef<string | null>(null);
  selectionRef.current = scene.overlay.selection?.key ?? null;

  // Stable order: alerts first, then priority — the layout sorts again, but a
  // stable DOM order keeps the nodes from being reshuffled between scenes.
  const entries = useMemo(
    () =>
      [...scene.labels]
        .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
        .map((label) => {
          const parts = labelParts(label.text);
          const glyph = labelKindOf(label, parts);
          return {
            label,
            parts,
            glyph,
            micro:
              glyph === "site" ||
              (label.kind === "object" && glyph !== "junction" && labelIdle(parts)),
            led:
              !label.muted &&
              !ALERT_KINDS.has(label.kind) &&
              (label.kind === "object" || label.kind === "site") &&
              label.priority >= LED_MIN_PRIORITY,
          };
        }),
    [scene.labels],
  );

  // Measure every box once per text, at the base tier with the suffix shown:
  // all writes first, then all reads, so the browser lays out once. The frame
  // loop calls the same routine when a node arrived without a box (a React
  // re-render can hand a node a fresh ref before the effect re-runs).
  const measureRef = useRef<(() => void) | null>(null);
  const needsMeasureRef = useRef(false);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      needsMeasureRef.current = false;
      const wasCompact = host.classList.contains("is-compact");
      host.classList.remove("is-compact");
      const nodes = [...nodesRef.current.values()];
      for (const node of nodes) {
        node.el.classList.remove("is-hidden", "is-d0", "is-d2", "is-d3");
        node.el.classList.add(`is-d${BASE_TIER}`, "is-measuring");
      }
      for (const node of nodes) {
        const rect = node.el.getBoundingClientRect();
        const tech = node.el.querySelector<HTMLElement>(".en-wlabel__tech");
        node.base = {
          width: rect.width,
          techWidth: tech ? tech.getBoundingClientRect().width : 0,
          microWidth: rect.width,
          height: rect.height,
        };
      }
      // Second pass, micro form: the name folded away, the kind glyph and the
      // values left. One more layout for the few labels that can fold.
      const folding = nodes.filter((node) => node.micro);
      for (const node of folding) node.el.classList.add("is-micro");
      for (const node of folding) {
        if (node.base) node.base.microWidth = node.el.getBoundingClientRect().width;
      }
      for (const node of folding) node.el.classList.remove("is-micro");
      for (const node of nodes) {
        node.el.classList.remove("is-measuring");
        node.el.classList.add("is-hidden");
        node.cache = emptyCache();
      }
      if (wasCompact) host.classList.add("is-compact");
      forceRef.current = true;
    };
    measureRef.current = measure;
    measure();
    // The mono face arrives after the first paint; boxes measured in the
    // fallback face are wrong by a few pixels per character.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    let cancelled = false;
    fonts?.ready
      .then(() => {
        if (!cancelled) measure();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      measureRef.current = null;
    };
  }, [entries]);

  useEffect(() => {
    const host = hostRef.current;
    if (!renderer || !host) return;
    let handle: number | null = null;
    let hard: Rect[] = [];
    let soft: Rect[] = [];
    let occluderSignature = "";
    let occludersDirty = true;
    let framesSinceMeasure = 0;
    let lastSignature = "";
    forceRef.current = true;

    const measureOccluders = () => {
      const hostRect = host.getBoundingClientRect();
      const collect = (selectors: readonly string[]): Rect[] => {
        const rects: Rect[] = [];
        for (const selector of selectors) {
          for (const element of document.querySelectorAll(selector)) {
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            rects.push({
              x0: rect.left - hostRect.left,
              y0: rect.top - hostRect.top,
              x1: rect.right - hostRect.left,
              y1: rect.bottom - hostRect.top,
            });
          }
        }
        return rects;
      };
      hard = collect(HARD_OCCLUDER_SELECTORS);
      soft = collect(SOFT_OCCLUDER_SELECTORS);
      occluderSignature = [...hard, ...soft]
        .map((r) => `${r.x0 | 0},${r.y0 | 0},${r.x1 | 0},${r.y1 | 0}`)
        .join(";");
      occludersDirty = false;
      framesSinceMeasure = 0;
    };

    const frame = () => {
      handle = requestAnimationFrame(frame);
      const rig = renderer.rig;
      const camera = rig.camera;
      const { width, height } = renderer.canvasSize;
      const hoverKey = renderer.sceneModel?.overlay.hover?.key ?? null;
      const selectedKey = selectionRef.current;

      // A node without a box cannot be placed: measure before anything else,
      // so the measurement's own writes and reads stay ahead of this frame's.
      if (needsMeasureRef.current) measureRef.current?.();

      // --- reads ---------------------------------------------------------
      framesSinceMeasure += 1;
      if (occludersDirty || framesSinceMeasure >= OCCLUDER_REFRESH_FRAMES) measureOccluders();
      const signature = `${camera.matrixWorld.elements.join(",")}|${camera.fov}|${width}x${height}|${hoverKey}|${selectedKey}|${occluderSignature}`;
      if (!forceRef.current && signature === lastSignature) return;
      lastSignature = signature;
      forceRef.current = false;
      const started = import.meta.env.DEV ? performance.now() : 0;

      const compact = rig.distanceKm > COMPACT_DISTANCE_KM;
      const pitchSin = Math.sin(rig.pitchDeg * DEG);
      const halfFovTan = Math.tan((camera.fov / 2) * DEG);
      // Camera basis for anchors the projection cannot place: an alert whose
      // object stands behind the camera still gets an edge chip, placed on the
      // side the object lies and pointing that way (never dropped).
      const basis = camera.matrixWorld.elements;
      const camX = basis[12]!;
      const camY = basis[13]!;
      const camZ = basis[14]!;
      const rightX = basis[0]!;
      const rightY = basis[1]!;
      const rightZ = basis[2]!;
      const upX = basis[4]!;
      const upY = basis[5]!;
      const upZ = basis[6]!;
      /**
       * Screen direction of a ground anchor the projection rejected: where the
       * camera would have to turn to bring the object into view. The anchor is
       * then pushed just past the viewport edge, so the layout clamps the chip
       * to that border and the leader reads as pointing off-screen.
       */
      const offscreenAnchor = (
        hex: WorldLabel["hex"],
        liftKm: number,
      ): { x: number; y: number } | null => {
        const ground = hexToWorld(hex);
        const vx = ground.x - camX;
        const vy = liftKm - camY;
        const vz = ground.z - camZ;
        const sx = vx * rightX + vy * rightY + vz * rightZ;
        const sy = -(vx * upX + vy * upY + vz * upZ);
        const length = Math.hypot(sx, sy);
        if (length < 1e-6) return null;
        const ux = sx / length;
        const uy = sy / length;
        const halfW = Math.max(1, width / 2 - MARGIN_EDGE);
        const halfH = Math.max(1, height / 2 - MARGIN_EDGE);
        const t = Math.min(
          ux === 0 ? Infinity : halfW / Math.abs(ux),
          uy === 0 ? Infinity : halfH / Math.abs(uy),
        );
        if (!Number.isFinite(t)) return null;
        return {
          x: width / 2 + ux * (t + EDGE_OVERSHOOT_PX),
          y: height / 2 + uy * (t + EDGE_OVERSHOOT_PX),
        };
      };
      const inputs: LabelInput[] = [];
      const meta = new Map<
        string,
        {
          label: WorldLabel;
          tier: number;
          depth: number;
          w: number;
          h: number;
          micro: boolean;
          anchorHidden: boolean;
          anchorX: number;
          anchorY: number;
        }
      >();
      for (const { label } of entries) {
        const node = nodesRef.current.get(label.key);
        if (!node?.base) continue;
        const projected = renderer.project(
          label.hex,
          label.placement === "above" ? LIFT_KM[label.kind] : 0,
        );
        const tier = tierOf(projected.depth);
        const scale = tierScale(tier);
        const micro = node.micro && tier === 0;
        const w =
          (micro ? node.base.microWidth : node.base.width - (compact ? node.base.techWidth : 0)) *
          scale;
        const h = node.base.height * scale;
        // An anchor the player cannot see — outside the viewport or under the
        // shell: the label is led to the edge and points the way (docs/08 §7 —
        // an alert is never culled). The direction is set once the box is placed.
        let anchorX = projected.x;
        let anchorY = projected.y;
        let anchorVisible = projected.visible;
        if (!projected.visible && ALERT_KINDS.has(label.kind)) {
          const anchor = offscreenAnchor(
            label.hex,
            label.placement === "above" ? LIFT_KM[label.kind] : 0,
          );
          if (anchor) {
            anchorX = anchor.x;
            anchorY = anchor.y;
            anchorVisible = true;
          }
        }
        const anchorHidden =
          anchorVisible &&
          (anchorX < 0 ||
            anchorX > width ||
            anchorY < 0 ||
            anchorY > height ||
            (projected.visible &&
              hard.some(
                (rect) =>
                  anchorX >= rect.x0 &&
                  anchorX <= rect.x1 &&
                  anchorY >= rect.y0 &&
                  anchorY <= rect.y1,
              )));
        const pxPerKm = height / 2 / (halfFovTan * Math.max(1, projected.depth));
        inputs.push({
          key: label.key,
          x: anchorX,
          y: anchorY,
          footprintPx: HEX_RADIUS_KM * pxPerKm * pitchSin * FOOTPRINT_SHARE,
          width: w,
          height: h,
          priority: label.priority,
          placement: label.placement,
          alert: ALERT_KINDS.has(label.kind),
          visible: anchorVisible,
          led: node.led,
        });
        meta.set(label.key, {
          label,
          tier,
          depth: projected.depth,
          w,
          h,
          micro,
          anchorHidden,
          anchorX,
          anchorY,
        });
      }
      const layoutStarted = import.meta.env.DEV ? performance.now() : 0;
      const placements = layoutLabels(inputs, { viewport: { width, height }, hard, soft });
      const layoutMs = import.meta.env.DEV ? performance.now() - layoutStarted : 0;

      // --- writes --------------------------------------------------------
      host.classList.toggle("is-compact", compact);
      let placedCount = 0;
      const culled: string[] = [];
      for (const placement of placements) {
        const node = nodesRef.current.get(placement.key);
        const info = meta.get(placement.key);
        if (!node || !info) continue;
        const { label } = info;
        const alert = ALERT_KINDS.has(label.kind);
        if (!placement.visible) {
          if (node.cache.className !== "hidden") {
            node.el.classList.add("is-hidden");
            node.cache.className = "hidden";
          }
          if (inputs.find((input) => input.key === placement.key)?.visible)
            culled.push(placement.key);
          continue;
        }
        placedCount += 1;
        // Whole pixels for the box corner: glyphs stay on the pixel grid.
        const x0 = Math.round(placement.x - info.w / 2);
        const y0 = Math.round(placement.y - info.h / 2);
        const transform = `translate(${x0}px, ${y0}px)`;
        let edge = "";
        if (info.anchorHidden) {
          const dx = info.anchorX - placement.x;
          const dy = info.anchorY - placement.y;
          edge =
            Math.abs(dy) >= Math.abs(dx)
              ? dy < 0
                ? EDGE_CLASS[0]
                : EDGE_CLASS[2]
              : dx > 0
                ? EDGE_CLASS[1]
                : EDGE_CLASS[3];
        }
        const opacity = alert
          ? "1"
          : (
              (label.muted ? MUTED_OPACITY : 1) *
              TIER_OPACITY[info.tier]! *
              fadeOf(info.depth)
            ).toFixed(2);
        const className = [
          "en-wlabel",
          `is-${label.tone}`,
          `is-${label.kind}`,
          `is-d${info.tier}`,
          label.muted ? "is-muted" : "",
          alert ? "is-alert" : "",
          placement.leader ? "is-lead" : "",
          info.micro ? "is-micro" : "",
          edge,
          selectedKey !== null && selectedKey === label.hex.key ? "is-selected" : "",
          hoverKey !== null && hoverKey === label.hex.key ? "is-hover" : "",
        ]
          .filter(Boolean)
          .join(" ");
        let lead = "";
        if (placement.leader) {
          const { fromX, fromY, toX, toY } = placement.leader;
          // Leader coordinates are local to the label's padding box (1 px border).
          const localX = fromX - x0 - 1;
          const localY = fromY - y0 - 1;
          const dx = toX - fromX;
          const dy = toY - fromY;
          const length = Math.hypot(dx, dy);
          lead = `left:${localX.toFixed(1)}px;top:${localY.toFixed(1)}px;width:${length.toFixed(1)}px;transform:rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
        }
        if (node.cache.transform !== transform) {
          node.el.style.transform = transform;
          node.cache.transform = transform;
        }
        if (node.cache.opacity !== opacity) {
          node.el.style.opacity = opacity;
          node.cache.opacity = opacity;
        }
        if (node.cache.className !== className) {
          node.el.className = className;
          node.cache.className = className;
        }
        if (node.cache.lead !== lead) {
          const leader = node.el.firstElementChild as HTMLElement | null;
          if (leader) leader.style.cssText = lead;
          node.cache.lead = lead;
        }
      }
      if (import.meta.env.DEV) {
        const debug: LabelsDebug = {
          compact,
          distanceKm: rig.distanceKm,
          hard,
          soft,
          inputs,
          placements,
          frameMs: performance.now() - started,
          layoutMs,
          placed: placedCount,
          total: inputs.filter((input) => input.visible).length,
          culled,
        };
        (window as unknown as Record<string, unknown>).__enLabels = debug;
      }
    };

    // Anything the HUD re-lays out (a panel swap, the report dock, a note)
    // moves the surfaces; a flag is enough — the next frame measures.
    const mutations = new MutationObserver(() => {
      occludersDirty = true;
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(() => {
      occludersDirty = true;
      forceRef.current = true;
    });
    resize.observe(host);
    const offReady = renderer.on("scene:ready", () => {
      occludersDirty = true;
      forceRef.current = true;
    });
    handle = requestAnimationFrame(frame);
    return () => {
      if (handle !== null) cancelAnimationFrame(handle);
      mutations.disconnect();
      resize.disconnect();
      offReady();
    };
  }, [renderer, entries]);

  return (
    <div className="en-wlabels" ref={hostRef} aria-hidden="true">
      {entries.map(({ label, parts, glyph, micro, led }) => (
        <span
          key={label.key}
          className="en-wlabel is-hidden"
          data-label={label.key}
          ref={(el) => {
            if (el) {
              // React re-attaches the ref on every render; a node that is
              // already known keeps the box it was measured with.
              if (nodesRef.current.get(label.key)?.el === el) return;
              nodesRef.current.set(label.key, {
                el,
                base: null,
                micro,
                led,
                cache: emptyCache(),
              });
              needsMeasureRef.current = true;
            } else nodesRef.current.delete(label.key);
          }}
        >
          <i className="en-wlabel__lead" />
          <span className="en-wlabel__text">
            {glyph && <i className={`en-wlabel__kind is-${glyph}`} />}
            <i className="en-wlabel__dir">▸</i>
            <span className="en-wlabel__name">{parts.name}</span>
            {parts.tech && <span className="en-wlabel__tech"> {parts.tech}</span>}
            {parts.values.map((value, index) => (
              <span
                className={index === 0 ? "en-wlabel__val is-first" : "en-wlabel__val"}
                key={index}
              >
                <span className="en-wlabel__sep"> · </span>
                {value}
              </span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
