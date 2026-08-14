/**
 * Sekcja panelu dyspozytora: etykieta wersalikami (10 px, letter-spacing 1,5 px)
 * i treść. Rozdzielona 1-px kreską, bez promieni i cieni.
 */
export interface PanelSectionProps {
  /** Etykieta sekcji, np. "NASTAWY". Pomiń dla sekcji bez nagłówka. */
  label?: string;
  /** Rozciąga sekcję na dostępną wysokość (sekcja nastaw). */
  grow?: boolean;
  /** Zagłębione tło — używane wyłącznie dla sekcji bilansu na dole panelu. */
  sunk?: boolean;
  children?: React.ReactNode;
}

export declare function PanelSection(props: PanelSectionProps): JSX.Element;
