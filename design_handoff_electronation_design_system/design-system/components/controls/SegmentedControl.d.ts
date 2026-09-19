export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * Wybór jednego z 2–3 trybów pracy obiektu (magazyn: ŁADUJ / STOP / ODDAWAJ).
 * Stan wybrany = obrys i tekst w kolorze --en-ok.
 */
export interface SegmentedControlProps {
  /** Opcje: same etykiety albo pary {value,label}. Maks. 3. */
  options: (string | SegmentedOption)[];
  /** Wartość wybrana. */
  value: string;
  onChange?: (value: string) => void;
  /** Etykieta dostępnościowa grupy, np. "Tryb magazynu". */
  ariaLabel?: string;
}

export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;
