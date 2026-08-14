export interface ForecastPoint {
  /** Dolny kres pasma w procentach skali wykresu. */
  lo: number;
  /** Górny kres pasma. */
  hi: number;
}

export interface ChartLegendItem {
  /** Token koloru technologii, np. "--en-wind". */
  token: string;
  label: string;
}

/**
 * Wykres doby pod osią tur: prawda za nami, pasmo prognozy przed nami,
 * pionowa kreska TERAZ. Warstwy pokrycia w kolejności merit order od dołu.
 *
 * @startingPoint section="Chart" subtitle="Doba: prawda, pasmo prognozy, TERAZ" viewport="700x180"
 */
export interface DayChartProps {
  width?: number;
  height?: number;
  /** Prawda: pokrycie w procentach skali, punkt na godzinę rozegraną. */
  truth?: number[];
  /** Prognoza: pasma dla godzin przed nami. */
  forecast?: ForecastPoint[];
  /** Pozycja kreski TERAZ jako udział szerokości (0–1). */
  nowRatio?: number;
  /** Liczba bloków doby. Domyślnie 8. */
  turns?: number;
  legend?: ChartLegendItem[];
  /** Podpis w lewym górnym rogu. */
  caption?: string;
  /** Nota po prawej stronie legendy. */
  note?: string;
}

export declare function DayChart(props: DayChartProps): JSX.Element;
