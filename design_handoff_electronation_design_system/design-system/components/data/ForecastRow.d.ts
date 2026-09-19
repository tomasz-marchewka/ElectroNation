/**
 * Wiersz prognozy z pasmem niepewności. Prognoza jest zawsze pasmem, nigdy liczbą
 * (06 §8.6.4) — pasmo szerokie dla wiatru, wąskie dla popytu.
 *
 * @startingPoint section="Data" subtitle="Prognoza jako pasmo, nie liczba" viewport="360x60"
 */
export interface ForecastRowProps {
  /** Nazwa wielkości wersalikami: "POPYT", "WIATR", "PV". */
  label: string;
  /** Wartość środkowa prognozy w MW. */
  value: number;
  /** Połowa szerokości pasma (±) w MW. Brak = wartość pewna. */
  band?: number;
  /** Dolny kres skali toru. Domyślnie 0. */
  min?: number;
  /** Górny kres skali toru — wspólny dla wszystkich wierszy sekcji. */
  max?: number;
  /** Kolor pasma i wartości: --en-wind, --en-pv, domyślnie neutralny. */
  color?: string;
  /** Tekst zamiast liczby, np. "0 · NOC" dla PV po zachodzie. */
  note?: string;
}

export declare function ForecastRow(props: ForecastRowProps): JSX.Element;
