// The time ribbon (01 §8 pt 2): day captions, the eight turn cells and the
// chart, all over one axis, plus the controls that slide the window. Markup and
// the curve that joins the points — every coordinate itself comes from the
// model built by ./timeline.
//
// Adapted from design-system/components/chart/DayChart.{jsx,d.ts} and
// shell/TurnBar.{jsx,d.ts}: same box, same block highlight, same dashed TERAZ
// line, same cell typography. Three divergences, all from the docs:
// the coverage is seven separately coloured layers instead of one four-stop
// gradient (01 §8 pt 2), the band carries on BEHIND TERAZ as the forecast that
// stood before each resolved turn (01 §8 pt 2, 0.18), and a click on a cell
// selects a turn to read instead of moving time (01 §2.5).

import { useRef, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { WINDOW_TURNS, round01, type ChartPoint, type TimelineModel } from "./timeline";

/** Trackpad pixels that make up one turn of scrolling. */
const WHEEL_STEP_PX = 40;

/** Pointer travel below this is a click, not a drag. */
const DRAG_SLOP_PX = 4;

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

export interface TimelineViewProps {
  model: TimelineModel;
  /** Reads a turn: the report strip follows, time never does (01 §2.5). */
  onSelect: (absTurn: number) => void;
  /** Slides the window by this many turns; the store clamps the result. */
  onScroll: (delta: number) => void;
  /** Back to the pending turn — window and selection at once. */
  onNow: () => void;
  /** Whether the ribbon is already showing now, with nothing else selected. */
  atNow: boolean;
  /**
   * Parked at the end of the legend, which is the bottom strip of the working
   * column and the screen's only place for a utility control (every corner of
   * the map carries a legend of its own).
   */
  children?: ReactNode;
}

export function TimelineView({
  model,
  onSelect,
  onScroll,
  onNow,
  atNow,
  children,
}: TimelineViewProps) {
  const { caption, scaleLabel, nowLabel, range } = model;
  const wheelRef = useRef(0);
  const dragRef = useRef<{
    startX: number;
    applied: number;
    cellPx: number;
    moved: boolean;
  } | null>(null);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    wheelRef.current += event.deltaX !== 0 ? event.deltaX : event.deltaY;
    const steps = Math.trunc(wheelRef.current / WHEEL_STEP_PX);
    if (steps === 0) return;
    wheelRef.current -= steps * WHEEL_STEP_PX;
    onScroll(steps);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const width = event.currentTarget.clientWidth;
    dragRef.current = {
      startX: event.clientX,
      applied: 0,
      cellPx: width > 0 ? width / WINDOW_TURNS : 0,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.cellPx === 0) return;
    const travel = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(travel) < DRAG_SLOP_PX) return;
    drag.moved = true;
    // Only the part of the drag not yet applied is sent on, so the window
    // follows the pointer instead of chasing it one step per event.
    const steps = -Math.round(travel / drag.cellPx);
    if (steps === drag.applied) return;
    onScroll(steps - drag.applied);
    drag.applied = steps;
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    return drag?.moved === true;
  };

  return (
    <>
      <div className="en-timeline">
        <button
          type="button"
          className="en-timeline__nav"
          onClick={() => onScroll(-1)}
          disabled={range.from <= range.minFrom}
          title="Wcześniejsze tury"
        >
          ◂
        </button>

        <div
          className="en-timeline__body"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div className="en-timeline__days">
            {model.days.map((day) => (
              <div
                className="en-timeline__day"
                key={day.dayIndex}
                style={{ flexGrow: day.columns }}
              >
                {day.label}
              </div>
            ))}
          </div>

          <div className="en-turnbar">
            {model.cells.map((cell) => {
              const className = [
                "en-turn",
                cell.state === "current" ? "is-current" : null,
                cell.state === "past" ? "is-past" : null,
                cell.selected ? "is-selected" : null,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  type="button"
                  className={className}
                  key={cell.absTurn}
                  aria-pressed={cell.selected}
                  title={`Pokaż turę ${cell.turnIndex + 1}`}
                  // A drag that ends on a cell moved the window; it did not pick
                  // a turn, and the click that follows it must not either.
                  onClick={() => {
                    if (!dragRef.current?.moved) onSelect(cell.absTurn);
                  }}
                >
                  {cell.name}
                  <br />
                  {cell.hours}
                  {cell.state === "current" ? ` ◂ TURA ${cell.turnIndex + 1}` : ""}
                </button>
              );
            })}
          </div>

          <div className="en-region--chart" data-region="chart">
            <svg
              className="en-chart"
              viewBox={`0 0 ${model.width} ${model.height}`}
              role="img"
              aria-label="Oś czasu: pokrycie i prognoza popytu"
            >
              <g fill="none" stroke="var(--en-border-subtle)" strokeWidth="1">
                {model.gridX.map((x) => (
                  <path key={x} d={`M${x} 0 V${model.height}`} />
                ))}
              </g>
              <g fill="none" stroke="var(--en-border)" strokeWidth="1">
                {model.dayGridX.map((x) => (
                  <path key={x} d={`M${x} 0 V${model.height}`} />
                ))}
              </g>
              {model.currentBlock && (
                <rect
                  x={model.currentBlock.x}
                  y="0"
                  width={model.currentBlock.width}
                  height={model.height}
                  fill="var(--en-action)"
                  opacity="0.07"
                />
              )}

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
              {/* The bet that was standing before each of those turns resolved. */}
              {model.pastForecast && (
                <>
                  <polygon
                    points={join(model.pastForecast.band)}
                    fill="var(--en-text)"
                    opacity="0.14"
                  />
                  <polyline
                    className="en-chart__forecast"
                    points={join(model.pastForecast.mid)}
                    fill="none"
                    stroke="var(--en-text)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    opacity="0.55"
                  />
                </>
              )}
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
                  <polygon
                    points={join(model.forecast.band)}
                    fill="var(--en-text)"
                    opacity="0.14"
                  />
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

              {model.selectedBlock && (
                <rect
                  className="en-chart__selected"
                  x={model.selectedBlock.x}
                  y="0.5"
                  width={model.selectedBlock.width}
                  height={model.height - 1}
                  fill="none"
                  stroke="var(--en-text-2)"
                  strokeWidth="1"
                />
              )}
              {model.nowX !== null && (
                <path
                  d={`M${model.nowX} 0 V${model.height}`}
                  stroke="var(--en-action)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}
              <g fontFamily="var(--en-font-mono)" fontSize="10">
                <text x={caption.x} y={caption.y} fill="var(--en-text-4)">
                  {caption.text}
                </text>
                <text x={scaleLabel.x} y={scaleLabel.y} fill="var(--en-text-4)" textAnchor="end">
                  {scaleLabel.text}
                </text>
                {model.nowX !== null && (
                  <text x={nowLabel.x} y={nowLabel.y} fill="var(--en-action)">
                    {nowLabel.text}
                  </text>
                )}
              </g>
            </svg>
          </div>
        </div>

        <div className="en-timeline__side">
          <button
            type="button"
            className="en-timeline__nav"
            onClick={() => onScroll(1)}
            disabled={range.from >= range.maxFrom}
            title="Późniejsze tury"
          >
            ▸
          </button>
          <button
            type="button"
            className="en-timeline__now"
            onClick={onNow}
            disabled={atNow}
            title="Wróć do tury bieżącej"
          >
            TERAZ
          </button>
        </div>
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
