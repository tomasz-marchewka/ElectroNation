export interface DayTurn {
  /** Nazwa pory doby wersalikami, np. "SZCZYT WIECZ.". */
  name: string;
  /** Blok godzin, np. "18–21". */
  hours: string;
}

/**
 * Oś doby pod mapą: 8 bloków po 3 godziny (01 §2.2). Tura bieżąca na kolorze akcji,
 * tury rozegrane przygaszone.
 *
 * @startingPoint section="Shell" subtitle="Oś doby: 8 tur po 3 h" viewport="700x60"
 */
export interface TurnBarProps {
  /** Lista tur. Domyślnie eksportowana stała DAY_TURNS (kanon z dokumentu 01). */
  turns?: DayTurn[];
  /** Indeks tury bieżącej (0–7). */
  current?: number;
  /** Klik w turę — np. przewinięcie do wybranej tury (01 §2.5). */
  onSelect?: (index: number) => void;
}

export declare const DAY_TURNS: DayTurn[];
export declare function TurnBar(props: TurnBarProps): JSX.Element;
