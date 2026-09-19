export type BiomeId = "nizina" | "wyzyna" | "gory" | "las" | "bagno" | "jezioro" | "morze" | "miasto";
export type LineType = "NN" | "SN" | "WN";
export type LineLoad = "ok" | "warn" | "over" | "idle";
export type ObjectKind = "coal" | "gas" | "wind" | "pv" | "bess" | "node" | "city" | "town" | "border";

export interface MapHex {
  col: number;
  row: number;
  /** Środek heksa w układzie SVG — użyj hexCenter(col,row). */
  x: number;
  y: number;
  biome: BiomeId;
}

export interface MapLine {
  /** Heks początkowy [kolumna, rząd] — trasa idzie przez środki heksów po drodze. */
  fromHex?: [number, number];
  /** Heks końcowy [kolumna, rząd]. */
  toHex?: [number, number];
  /** Awaryjnie: punkty w px (odcinek prosty, bez trasowania po heksach). */
  from?: [number, number];
  /** Awaryjnie: punkt końcowy w px. */
  to?: [number, number];
  /** Typ linii wyznacza grubość: NN 2,5 / SN 4 / WN 6 px (01 §4.2). */
  type: LineType;
  /** Obciążenie wyznacza kolor; "idle" = linia bez przepływu (kreskowana). */
  load: LineLoad;
}

export interface MapObject {
  x: number;
  y: number;
  kind: ObjectKind;
  /** Miasto w niedoborze — czerwony pierścień z pulsowaniem. */
  alert?: boolean;
}

export interface MapLabel {
  x: number;
  y: number;
  text: string;
  /** "city" = jaśniejsza i pogrubiona, "danger" = miasto w niedoborze. */
  tone?: "city" | "danger";
}

/**
 * Mapa heksagonalna świata gry: pełne kafelkowanie biomami (każdy heks ma typ terenu
 * i mnożnik kosztu), korytarze linii z animowanym kierunkiem przepływu, obiekty
 * rysowane NA biomie (pierścień + podkładka pod ikoną, żeby teren był dalej widoczny).
 *
 * @startingPoint section="Map" subtitle="Mapa heksów z biomami i przepływami" viewport="1060x640"
 */
export interface HexMapProps {
  /** Liczba kolumn generowanego pola, gdy nie podasz hexes. Domyślnie 21. */
  cols?: number;
  /** Liczba rzędów generowanego pola. Domyślnie 11. */
  rows?: number;
  /** Szerokość układu SVG. Domyślnie 1060. */
  width?: number;
  /** Wysokość układu SVG. Domyślnie 640. */
  height?: number;
  /** Pole heksów. Bez tego rysuje się jednolita nizina o zadanym rozmiarze. */
  hexes?: MapHex[];
  lines?: MapLine[];
  objects?: MapObject[];
  labels?: MapLabel[];
  /** Etykieta przeciążonego korytarza, np. { x: 712, y: 516, text: "NN 150/150 ⚠" }. */
  overloadLabel?: { x: number; y: number; text: string };
  /** Podziałka w prawym dolnym rogu. Domyślnie "1 HEKS = 25 KM". */
  scaleLabel?: string;
  showBiomeLegend?: boolean;
  showLineLegend?: boolean;
  /** Klik w heks — otwarcie panelu heksa (01 §8 pkt 6). */
  onHexClick?: (hex: MapHex) => void;
}

export declare const BIOMES: { id: BiomeId; label: string }[];
export declare const HEX_R: number;
export declare const STEP_X: number;
export declare const STEP_Y: number;
export declare const HEX_PATH: string;
export declare function hexCenter(col: number, row: number): { x: number; y: number };
/** Łańcuch heksów trasy między dwoma heksami (włącznie z końcami). */
export declare function hexLine(a: [number, number], b: [number, number]): { col: number; row: number }[];
/** Linie → łamane w px; linie w tym samym korytarzu rozjeżdżają się równolegle. */
export declare function routeLines(lines: MapLine[]): [number, number][][];
export declare const CORRIDOR_SPACING: number;
export declare function HexMap(props: HexMapProps): JSX.Element;
