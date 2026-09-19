/* Przykładowy fragment świata: 21×11 heksów, 3 miasta, węzeł, granica.
   Ten sam stan gry, na którym powstały mocki obu motywów. */

export const COLS = 21;
export const ROWS = 11;

const URBAN = ["8,7", "12,7", "14,9", "8,8", "12,6", "15,9"];
const LAKE = ["12,10", "13,9", "13,10", "11,10"];
const MARSH = ["11,9", "10,10", "11,8", "10,9", "14,10"];
const EXTRA_FOREST = ["3,5", "5,5", "7,9", "6,10"];
const EXTRA_MOUNTAIN = ["4,0", "0,1", "4,2"];
const EXTRA_SEA = ["16,0", "16,1", "20,3"];

function hash(c, r) {
  const h = (c * 73856093) ^ (r * 19349663);
  return Math.abs(h) % 100;
}

export function biomeAt(col, row) {
  const k = col + "," + row;
  if (URBAN.includes(k)) return "miasto";
  if (col >= 1 && col <= 3 && row <= 3) return "gory";
  if (EXTRA_MOUNTAIN.includes(k)) return "gory";
  if (col <= 6 && row <= 4) return "wyzyna";
  if (col >= 2 && col <= 6 && row >= 6 && row <= 9) return "las";
  if (EXTRA_FOREST.includes(k)) return "las";
  if (LAKE.includes(k)) return "jezioro";
  if (MARSH.includes(k)) return "bagno";
  if (col >= 17 && row <= 2) return "morze";
  if (EXTRA_SEA.includes(k)) return "morze";
  const h = hash(col, row);
  if (h % 13 === 0) return "wyzyna";
  if (h % 17 === 0) return "las";
  if (h % 29 === 0) return "bagno";
  return "nizina";
}

export function buildWorld() {
  const out = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const x = 34 + 51 * c;
      const y = (c % 2 ? 59 : 29.5) + 59 * r;
      if (y > 640) continue;
      out.push({ col: c, row: r, x, y, biome: biomeAt(c, r) });
    }
  }
  return out;
}

export const LINES = [
  { fromHex: [6, 6], toHex: [9, 6], type: "WN", load: "ok" },      // EW Jarnowo → węzeł
  { fromHex: [9, 6], toHex: [8, 7], type: "SN", load: "warn" },    // węzeł → Jarnowo
  { fromHex: [9, 6], toHex: [12, 7], type: "SN", load: "warn" },   // węzeł → Bystrzyca
  { fromHex: [12, 7], toHex: [14, 9], type: "NN", load: "over" },  // Bystrzyca → Krasnów (wąskie gardło)
  { fromHex: [4, 1], toHex: [9, 6], type: "SN", load: "ok" },      // FW Grzbiet → węzeł
  { fromHex: [10, 6], toHex: [9, 6], type: "SN", load: "ok" },     // EC Dolina → węzeł
  { fromHex: [10, 10], toHex: [9, 6], type: "NN", load: "idle" },  // PV Łęgi → węzeł (bez przepływu)
  { fromHex: [7, 7], toHex: [9, 6], type: "NN", load: "ok" },      // BESS → węzeł
  { fromHex: [18, 7], toHex: [12, 7], type: "SN", load: "ok" },    // granica → Bystrzyca
];

/* Obiekty: hex = [kolumna, rząd]; x,y wyliczone z hexCenter dla wygody rysowania. */
export const OBJECTS = [
  { hex: [6, 6], x: 340, y: 383.5, kind: "coal" },
  { hex: [10, 6], x: 544, y: 383.5, kind: "gas" },
  { hex: [4, 1], x: 238, y: 88.5, kind: "wind" },
  { hex: [10, 10], x: 544, y: 619.5, kind: "pv" },
  { hex: [7, 7], x: 391, y: 472, kind: "bess" },
  { hex: [9, 6], x: 493, y: 413, kind: "node" },
  { hex: [18, 7], x: 952, y: 442.5, kind: "border" },
  { hex: [8, 7], x: 442, y: 442.5, kind: "city" },
  { hex: [12, 7], x: 646, y: 442.5, kind: "town" },
  { hex: [14, 9], x: 748, y: 560.5, kind: "town", alert: true },
];

export const LABELS = [
  { x: 340, y: 432, text: "EW JARNOWO · 800/900" },
  { x: 544, y: 352, text: "EC DOLINA · 250/400" },
  { x: 238, y: 134, text: "FW GRZBIET · ~320" },
  { x: 544, y: 596, text: "PV ŁĘGI · 0" },
  { x: 391, y: 518, text: "BESS · −100 · SOC 62%" },
  { x: 493, y: 458, text: "WĘZEŁ · 870/1000" },
  { x: 952, y: 488, text: "GRANICA WSCHÓD · +100" },
  { x: 442, y: 490, text: "JARNOWO · 720 MW", tone: "city" },
  { x: 646, y: 490, text: "BYSTRZYCA · 465 MW", tone: "city" },
  { x: 748, y: 608, text: "KRASNÓW · 300 MW", tone: "danger" },
];

export const OVERLOAD_LABEL = { x: 712, y: 516, text: "NN 150/150 ⚠" };
