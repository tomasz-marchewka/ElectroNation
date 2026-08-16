// Adapted from design-system/components/chart/DayChart.{jsx,d.ts}: same box,
// same block highlight, same dashed TERAZ line. Markup and the curve that joins
// the points — every coordinate itself comes from the model built by ./dayChart.
//
// Two divergences from the handoff, both from the docs (01 §8 pt 2, 06 §8.6.4):
// the coverage is seven separately coloured layers instead of one four-stop
// gradient, and the band ahead of TERAZ is the DEMAND forecast — the same
// quantity as the truth line behind it, so it carries the same colour and
// differs only in being dashed, exactly as the legend note says.

import type { ReactNode } from "react";
import { round01, type ChartPoint, type DayChartModel } from "./dayChart";

function join(points: readonly ChartPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * The block lines of the model, joined by cubics whose tangents are horizontal
 * at both ends — controls sit at the span's own midpoint, which makes each one
 * the exact smoothstep between its two levels.
 *
 * One rule covers the whole outline, because that rule leaves everything but a
 * turn boundary alone: a span at one level stays perfectly level (the block's
 * flat 3 h average — 01 §2.2), a span at one x stays perfectly vertical (an
 * area closing on the TERAZ line), and only the window the model left open
 * between two blocks actually curves. Reversed, a cubic traces the same curve,
 * so a layer's top edge still meets the next layer's bottom edge exactly.
 */
function smoothPath(points: readonly ChartPoint[], close = false): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${first.x} ${first.y}`;
  let from = first;
  for (const to of rest) {
    const mid = round01((from.x + to.x) / 2);
    d += ` C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`;
    from = to;
  }
  return close ? `${d} Z` : d;
}

export interface DayChartViewProps {
  model: DayChartModel;
  /**
   * Parked at the end of the legend, which is the bottom strip of the working
   * column and the screen's only place for a utility control (every corner of
   * the map carries a legend of its own).
   */
  children?: ReactNode;
}

export function DayChartView({ model, children }: DayChartViewProps) {
  const { caption, scaleLabel, nowLabel } = model;
  return (
    <>
      <div className="en-region--chart" data-region="chart">
        <svg
          className="en-chart"
          viewBox={`0 0 ${model.width} ${model.height}`}
          role="img"
          aria-label="Wykres doby: pokrycie i prognoza popytu"
        >
          <g fill="none" stroke="var(--en-border-subtle)" strokeWidth="1">
            {model.gridX.map((x) => (
              <path key={x} d={`M${x} 0 V${model.height}`} />
            ))}
          </g>
          <rect
            x={model.currentBlock.x}
            y="0"
            width={model.currentBlock.width}
            height={model.height}
            fill="var(--en-action)"
            opacity="0.07"
          />

          {/* Truth behind us: coverage by technology, merit order from the
              bottom, then the demand it had to cover. */}
          <g opacity="0.65">
            {model.areas.map((area) => (
              <path
                key={area.key}
                className="en-chart__area"
                d={smoothPath(area.points, true)}
                fill={area.color}
              />
            ))}
          </g>
          {model.demandLine.length > 0 && (
            <path
              className="en-chart__demand"
              d={smoothPath(model.demandLine)}
              fill="none"
              stroke="var(--en-text)"
              strokeWidth="2"
            />
          )}

          {/* Ahead of us: the forecast, never without its band. */}
          {model.forecast && (
            <>
              <polygon points={join(model.forecast.band)} fill="var(--en-text)" opacity="0.14" />
              <polyline
                className="en-chart__forecast"
                points={join(model.forecast.mid)}
                fill="none"
                stroke="var(--en-text)"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            </>
          )}

          <path
            d={`M${model.nowX} 0 V${model.height}`}
            stroke="var(--en-action)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <g fontFamily="var(--en-font-mono)" fontSize="10">
            <text x={caption.x} y={caption.y} fill="var(--en-text-4)">
              {caption.text}
            </text>
            <text x={scaleLabel.x} y={scaleLabel.y} fill="var(--en-text-4)" textAnchor="end">
              {scaleLabel.text}
            </text>
            <text x={nowLabel.x} y={nowLabel.y} fill="var(--en-action)">
              {nowLabel.text}
            </text>
          </g>
        </svg>
      </div>

      <div className="en-chartlegend">
        {model.legend.map((entry) => (
          <span key={entry.label}>
            <span className="en-swatch" style={{ background: entry.color }} /> {entry.label}
          </span>
        ))}
        <span className="en-chartlegend__note">{model.note}</span>
        {children}
      </div>
    </>
  );
}
