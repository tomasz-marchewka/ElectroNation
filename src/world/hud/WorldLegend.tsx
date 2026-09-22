// The world legend (docs/08 §3, ARCHITECTURE.md §9): what the light of the
// world means, in the design system's voice — uppercase mono, the allowed
// glyphs only, thresholds as the canon states them. A key, not a control:
// nothing here is a number of the game. Its one button folds it away once
// the encoding is learned (remembered in the world settings), because a key
// that has been read is a strip covering the country.
//
// It stands top-right against the panel. Unfolded it is a 500 px strip across
// the north coast of the strategic frame (the terrain module's relief brought
// the far edge up under it), so it starts folded: the title stays in view and
// one press opens the key. The label layer treats it as a soft occluder —
// texts are pushed out from under it and led back.

import { useWorldSettings } from "./settingsStore";

interface LegendItem {
  /** Swatch drawn before the words: a conductor bar, a ground ring, a light. */
  swatch:
    | "bar-idle"
    | "bar-ok"
    | "bar-warn"
    | "bar-over"
    | "ring-danger"
    | "ring-warn"
    | "light-full"
    | "light-warm"
    | "light-startup"
    | "light-off"
    | "rotor-still"
    | "rotor-spin"
    | "rotor-feathered"
    | null;
  text: string;
}

interface LegendRow {
  key: string;
  items: LegendItem[];
}

const ROWS: LegendRow[] = [
  {
    key: "LINIE",
    items: [
      { swatch: "bar-idle", text: "BEZ PRZEPŁYWU" },
      { swatch: "bar-ok", text: "OK" },
      { swatch: "bar-warn", text: "OD 75 %" },
      { swatch: "bar-over", text: "OD 99,5 %" },
      { swatch: "ring-danger", text: "WĄSKIE GARDŁO = PIERŚCIEŃ" },
    ],
  },
  {
    key: "MIASTA",
    items: [
      { swatch: "light-full", text: "ŚWIATŁA = DOSTARCZONA / POPYT" },
      { swatch: "ring-danger", text: "⚠ NIEDOBÓR = PIERŚCIEŃ · −ENS" },
      { swatch: "light-off", text: "BEZ PRZYŁĄCZA = CIEMNE" },
    ],
  },
  {
    key: "BLOKI",
    items: [
      { swatch: "light-warm", text: "W RUCHU = OKNA + SMUGA WG PRODUKCJI" },
      { swatch: "light-startup", text: "W ROZRUCHU = POŚWIATA" },
      { swatch: "light-off", text: "WYŁĄCZONY = CIEMNY" },
    ],
  },
  {
    key: "WIRNIKI",
    items: [
      { swatch: "rotor-still", text: "STOI PONIŻEJ 3 m/s" },
      { swatch: "rotor-spin", text: "KRĘCI SIĘ 3–25 m/s" },
      { swatch: "rotor-feathered", text: "CHORĄGIEWKA OD 25 m/s" },
      { swatch: "ring-warn", text: "PRZYCIĘTA = PIERŚCIEŃ" },
      { swatch: "light-off", text: "WYŁĄCZONA = BEZ ŚWIATEŁ" },
    ],
  },
];

function Swatch({ kind }: { kind: NonNullable<LegendItem["swatch"]> }) {
  const [shape, tone] = kind.split("-");
  return <i className={`en-worldlegend__${shape} is-${tone}`} aria-hidden="true" />;
}

export function WorldLegend() {
  const legend = useWorldSettings((store) => store.legend);
  const setLegend = useWorldSettings((store) => store.setLegend);
  const open = legend === "open";
  return (
    <div
      className={open ? "en-worldlegend" : "en-worldlegend is-collapsed"}
      data-region="legend"
      role="note"
      aria-label="Legenda świata"
    >
      <div className="en-worldlegend__head">
        <span className="en-worldlegend__title">LEGENDA ŚWIATŁA</span>
        {open && (
          <span className="en-worldlegend__hint">STAN = ŚWIATŁO · EMISJA · RUCH · SYLWETKA</span>
        )}
        <button
          type="button"
          className="en-seg en-worldlegend__toggle"
          aria-expanded={open}
          aria-controls="en-worldlegend-key"
          title={open ? "Zwiń legendę" : "Rozwiń legendę"}
          onClick={() => setLegend(open ? "closed" : "open")}
        >
          {open ? "ZWIŃ ◂" : "ROZWIŃ ▸"}
        </button>
      </div>
      {open && (
        <div className="en-worldlegend__grid" id="en-worldlegend-key">
          {ROWS.map((row) => (
            <div className="en-worldlegend__row" key={row.key}>
              <span className="en-worldlegend__key">{row.key}</span>
              <span className="en-worldlegend__items">
                {row.items.map((item) => (
                  <span className="en-worldlegend__item" key={item.text}>
                    {item.swatch && <Swatch kind={item.swatch} />}
                    {item.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
