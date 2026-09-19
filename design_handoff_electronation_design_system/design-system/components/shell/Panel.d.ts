/**
 * Panel dyspozytora: kolumna 400 px dokowana przy prawej krawędzi mapy,
 * stale widoczna (01 §8). Nagłówek = meta tury + nazwa bieżącej tury.
 *
 * @startingPoint section="Shell" subtitle="Panel dyspozytora, 400 px" viewport="440x640"
 */
export interface PanelProps {
  /** Wiersz meta nad tytułem, np. "TURA 7/8 · LISTOPAD · ×10,9 DNIA". */
  meta?: string;
  /** Nazwa bieżącej tury wersalikami, np. "SZCZYT WIECZORNY". */
  title?: string;
  /** Zakres godzin bloku, np. "18–21". Wyświetlany szarzej obok tytułu. */
  hours?: string;
  /** Szerokość panelu. Domyślnie token --en-panel-w (400 px). */
  width?: number | string;
  /** Sekcje panelu (PanelSection). */
  children?: React.ReactNode;
}

export declare function Panel(props: PanelProps): JSX.Element;
