/**
 * Pastylka włącz/wyłącz — całą farmę OZE, nigdy część jej mocy (01 §4.1).
 */
export interface TogglePillProps {
  /** Czy farma pracuje. */
  on?: boolean;
  /** Etykiety [włączona, wyłączona]. Domyślnie ["WŁ.", "WYŁ."]. */
  labels?: [string, string];
  onChange?: (on: boolean) => void;
}

export declare function TogglePill(props: TogglePillProps): JSX.Element;
