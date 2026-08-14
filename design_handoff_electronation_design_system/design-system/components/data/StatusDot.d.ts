/**
 * Kropka stanu: zielona ≤75 % obciążenia, żółta >75 %, czerwona na limicie (01 §8).
 */
export interface StatusDotProps {
  tone?: "ok" | "warn" | "danger" | "info" | "idle";
  /** Rozmiar w px. Domyślnie 8. */
  size?: number;
  /** Opis obok kropki, np. ">75%". */
  label?: string;
}

export declare function StatusDot(props: StatusDotProps): JSX.Element;
