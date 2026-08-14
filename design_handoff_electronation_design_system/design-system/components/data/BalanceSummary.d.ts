export interface BalanceRow {
  /** Nazwa składnika wersalikami: "ZAPOTRZEBOWANIE", "STRATY PRZESYŁU", "PLAN POKRYCIA". */
  label: string;
  /** Wartość w MW jako tekst. */
  value: string;
}

/**
 * Podsumowanie bilansu na dole panelu: co trzeba pokryć, ile zjedzą straty,
 * ile zostaje zapasu. Zapas to jedyna liczba, na której gracz się uczy (01 §4.1).
 *
 * @startingPoint section="Data" subtitle="Bilans tury i zapas mocy" viewport="360x170"
 */
export interface BalanceSummaryProps {
  rows?: BalanceRow[];
  /** Etykieta wiersza wyróżnionego. Domyślnie "ZAPAS". */
  totalLabel?: string;
  /** Wartość zapasu, np. "+25 MW (1,6%)". */
  total: string;
  /** Zabarwienie zapasu: ok = bezpieczny, warn = cienki, danger = ujemny. */
  tone?: "ok" | "warn" | "danger";
  /** Nota diagnostyczna, np. "⚠ dolne pasmo wiatru = −60 MW → ryzyko niedoboru". */
  note?: string;
}

export declare function BalanceSummary(props: BalanceSummaryProps): JSX.Element;
