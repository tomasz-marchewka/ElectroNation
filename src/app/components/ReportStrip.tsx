// Adapted from design-system/components/data/ReportStrip.{jsx,d.ts}.
// The settlement of the last resolved turn, full width under the map. Tile
// order tells cause and effect: weather → delivery → shortfall → money →
// result (ReportStrip.prompt.md).
//
// Two divergences from the handoff. Its label reads "PO ZATWIERDZENIU", because
// the reference build only showed the strip right after a commit; in the game
// the report is a permanent part of the continuous view (01 §2.3) — it is there
// after loading a save too — so the caller names the turn the numbers belong to.
// And since 0.18 the turn it names is the one SELECTED on the ribbon, which may
// be one still ahead: then the tiles are a forecast, not a result. The strip
// stays a read-out either way — the action about a turn ahead lives next to
// ZATWIERDŹ TURĘ, where every other move of time already lives (01 §2.5).

export type ReportTone = "ok" | "warn" | "danger" | "info";

export interface ReportTile {
  /** Entry name, e.g. "NIEDOBÓR". */
  label: string;
  /** Value with its unit, already formatted. */
  value: string;
  /** Where the number comes from, e.g. "650 zł/MWh × 10,9". */
  note?: string;
  tone?: ReportTone;
  /** Tinted background — the last tile, the turn's result. */
  highlight?: boolean;
}

export interface ReportStripProps {
  /** Over-label on the left. */
  label?: string;
  /** Bold title under the label. */
  title?: string;
  /** Which day the turn belongs to, under the title. */
  note?: string;
  tiles?: readonly ReportTile[];
}

export function ReportStrip({
  label = "RAPORT OSTATNIEJ TURY",
  title,
  note,
  tiles = [],
}: ReportStripProps) {
  return (
    <div className="en-report" data-region="report">
      <div className="en-report__label">
        {label}
        {title && (
          <>
            <br />
            <b>{title}</b>
          </>
        )}
        {note && (
          <>
            <br />
            {note}
          </>
        )}
      </div>
      <div className="en-report__tiles">
        {tiles.map((tile) => (
          <div className={tile.highlight ? "en-tile en-tile--ok" : "en-tile"} key={tile.label}>
            <div className={tile.tone ? `en-tile__label is-${tile.tone}` : "en-tile__label"}>
              {tile.label}
            </div>
            <div className={tile.tone ? `en-tile__value is-${tile.tone}` : "en-tile__value"}>
              {tile.value}
            </div>
            {tile.note && <div className="en-tile__note">{tile.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
