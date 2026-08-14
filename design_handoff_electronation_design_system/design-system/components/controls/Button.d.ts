/**
 * Przycisk. W całej grze istnieje dokładnie jedna akcja główna na ekran —
 * zatwierdzenie tury; wszystko inne jest ghostem.
 *
 * @startingPoint section="Controls" subtitle="Akcja główna i ghost" viewport="360x70"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** "primary" = kolor akcji (--en-action), "ghost" = obrys. */
  variant?: "primary" | "ghost";
  /** Rozciąga na pełną szerokość kontenera. */
  block?: boolean;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;
