export interface TopBarKpi {
  /** Etykieta wskaźnika, np. "BUDŻET". Pisana wersalikami. */
  label: string;
  /** Wartość z jednostką, np. "7,42 mld zł". */
  value: string;
  /** Zabarwienie wartości. Domyślnie neutralne. */
  tone?: "ok" | "warn" | "danger";
}

/**
 * Pasek górny ekranu dyspozytora: znak gry, kontekst (rok, miesiąc, typ doby),
 * reżim pogodowy i 2–4 wskaźniki stanu gry.
 *
 * @startingPoint section="Shell" subtitle="Pasek górny: kontekst gry i wskaźniki" viewport="700x120"
 */
export interface TopBarProps {
  /** Nazwa gry w znaku. Domyślnie "ELECTRONATION". */
  mark?: string;
  /** Kontekst czasu, np. "ROK 3 · LISTOPAD · DOBA ROBOCZA A". */
  context?: string;
  /** Nazwa reżimu pogodowego (06 §8.2), np. "niż atlantycki". */
  regime?: string;
  /** Wskaźniki wyrównane do prawej krawędzi. Maks. 4 — dalej pasek się tłoczy. */
  kpis?: TopBarKpi[];
}

export declare function TopBar(props: TopBarProps): JSX.Element;
