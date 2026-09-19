// The diagnostics line (docs/08 §7): a module that failed, a renderer running
// in fallback — `⚠ moduł <id> wyłączony — <błąd>`, printed whole and always:
// a diagnosis cut off with an ellipsis is no diagnosis. The bridge's notes
// (a derivation it could not make) are a developer's caveat, not a
// dispatcher's diagnosis: they fold into a one-line chip that names how many
// there are and opens on a press. Never a modal; it sits under the weather
// strip and the world keeps running behind it.

import { useState } from "react";

export interface DiagnosticsProps {
  lines: readonly string[];
}

/** A line that begins with the warning glyph names a failure; the rest are notes. */
function toneOf(line: string): "warn" | "note" {
  return line.startsWith("⚠") ? "warn" : "note";
}

/** Polish plural of "nota": 1 NOTA, 2–4 NOTY, 5+ NOT (and 12–14 NOT). */
function notesWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (count === 1) return "NOTA";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "NOTY";
  return "NOT";
}

export function Diagnostics({ lines }: DiagnosticsProps) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  const failures = lines.filter((line) => toneOf(line) === "warn");
  const notes = lines.filter((line) => toneOf(line) === "note");
  const folded = notes.length > 0 && !open;
  return (
    <div
      className={failures.length > 0 ? "en-diagnostics has-warn" : "en-diagnostics"}
      data-region="diagnostics"
      role="status"
    >
      <div className="en-diagnostics__head">
        <span className="en-diagnostics__title">DIAGNOSTYKA</span>
        {notes.length > 0 && (
          <button
            type="button"
            className="en-diagnostics__toggle"
            aria-expanded={open}
            aria-controls="en-diagnostics-notes"
            title={open ? "Zwiń noty mostu" : "Rozwiń noty mostu"}
            onClick={() => setOpen((value) => !value)}
          >
            · {notes.length} {notesWord(notes.length)} {open ? "◂" : "▸"}
          </button>
        )}
      </div>
      {failures.map((line) => (
        <div className="en-diagnostics__line is-warn" key={line}>
          {line}
        </div>
      ))}
      {!folded && notes.length > 0 && (
        <div id="en-diagnostics-notes">
          {notes.map((line) => (
            <div className="en-diagnostics__line is-note" key={line}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
