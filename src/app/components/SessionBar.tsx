// Session actions: start over, write the state to a file, read one back. They
// join the theme switch at the end of the chart legend, which is the screen's
// utility strip (M8) — the top bar carries no actions (TopBar.prompt.md) and
// the panel's one button is the primary one (ZATWIERDŹ TURĘ).
//
// "ZAPISZ / WCZYTAJ Z PLIKU", not "EKSPORT / IMPORT": in this game export and
// import are cross-border power flows (01 §5.7), and the words are taken.

import { useRef, useState, type ChangeEvent } from "react";
import { loadErrorText } from "../labels";
import { downloadSave } from "../save/file";
import { newSessionSeed, useGameStore } from "../store/gameStore";

export function SessionBar() {
  const game = useGameStore((store) => store.game);
  const notice = useGameStore((store) => store.saveNotice);
  const restart = useGameStore((store) => store.restart);
  const importSave = useGameStore((store) => store.importSave);
  // A new game overwrites the autosave, so it asks first. Two steps in place of
  // a dialog: the design system has no modal and no motion to open one with.
  const [confirming, setConfirming] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);

  async function onPick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Clearing the input keeps the change event coming when the player picks
    // the very same file twice.
    event.target.value = "";
    if (file) await importSave(file);
  }

  return (
    <div className="en-sessionbar">
      {notice && (
        <span className={`en-sessionbar__note is-${notice.kind === "loaded" ? "ok" : "danger"}`}>
          {notice.kind === "loaded" ? "✓ ZAPIS WCZYTANY" : `✕ ${loadErrorText(notice.error)}`}
        </span>
      )}
      {confirming && <span className="en-sessionbar__note">NOWA GRA NADPISUJE AUTOZAPIS</span>}

      <span className="en-segmented">
        {confirming ? (
          <>
            <button
              type="button"
              className="en-seg"
              onClick={() => {
                setConfirming(false);
                restart(newSessionSeed());
              }}
            >
              POTWIERDŹ ✓
            </button>
            <button type="button" className="en-seg" onClick={() => setConfirming(false)}>
              ANULUJ ✕
            </button>
          </>
        ) : (
          <>
            <button type="button" className="en-seg" onClick={() => setConfirming(true)}>
              NOWA GRA
            </button>
            <button type="button" className="en-seg" onClick={() => downloadSave(game)}>
              ZAPISZ DO PLIKU
            </button>
            <button type="button" className="en-seg" onClick={() => filePicker.current?.click()}>
              WCZYTAJ Z PLIKU
            </button>
          </>
        )}
      </span>

      <input
        ref={filePicker}
        type="file"
        accept="application/json,.json"
        aria-label="Wczytaj zapis gry z pliku"
        className="en-sessionbar__file"
        onChange={(event) => void onPick(event)}
      />
    </div>
  );
}
