export interface ReportTile {
  /** Etykieta pozycji, np. "NIEDOBÓR". */
  label: string;
  /** Wartość, np. "15 MW · KRASNÓW". */
  value: string;
  /** Doprecyzowanie: skąd ta liczba, np. "4 000 zł/MWh". */
  note?: string;
  /** Zabarwienie etykiety i wartości. */
  tone?: "ok" | "warn" | "danger" | "info";
  /** Podbite tło — używane dla ostatniego kafla (wynik tury). */
  highlight?: boolean;
}

/**
 * Pasek raportu tury: co naprawdę weszło z pogody, ile dostarczono, gdzie zabrakło
 * i ile to kosztowało (01 §2.3 faza 3–4).
 *
 * @startingPoint section="Data" subtitle="Raport tury: 5–7 kafli" viewport="700x80"
 */
export interface ReportStripProps {
  /** Nadetykieta po lewej. */
  label?: string;
  /** Tytuł po lewej, wytłuszczony. */
  title?: string;
  tiles?: ReportTile[];
}

export declare function ReportStrip(props: ReportStripProps): JSX.Element;
