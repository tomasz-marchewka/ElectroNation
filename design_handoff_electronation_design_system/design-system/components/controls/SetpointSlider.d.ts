/**
 * Nastawa mocy jednostki sterowalnej — pełny zakres 0–100 % w każdej turze (01 §5.1).
 * Uchwyt to kreska 3×12 px, nie kółko: to aparatura, nie formularz.
 *
 * @startingPoint section="Controls" subtitle="Nastawa mocy jednostki" viewport="360x90"
 */
export interface SetpointSliderProps {
  /** Nazwa obiektu wersalikami, np. "EW JARNOWO". */
  name: string;
  /** Technologia małymi literami, np. "węgiel", "CCGT", "szczyt". */
  tech?: string;
  /** Nastawa bieżąca w MW. */
  value: number;
  /** Moc maksymalna w MW. */
  max: number;
  /** Jednostka wartości. Domyślnie "MW". */
  unit?: string;
  /** Nota pod suwakiem — koszt zmienny, np. "250 zł/MWh". */
  note?: string;
  /** Kolor wypełnienia — token technologii (--en-coal-ico, --en-gas-ico, --en-storage). */
  color?: string;
  /** Zmiana nastawy. Bez niej suwak jest tylko do odczytu. */
  onChange?: (value: number) => void;
}

export declare function SetpointSlider(props: SetpointSliderProps): JSX.Element;
