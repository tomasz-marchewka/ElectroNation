/* ElectroNation — UI kit: ekran dyspozytora (01 §8).
   Stan gry: rok 3, listopad, doba robocza A, tura 7/8 SZCZYT WIECZORNY.
   Liczby wg dokumentów: taryfa 650 zł/MWh, kara 4 000 zł/MWh, ×10,9 dnia,
   CAPEX-y z 01 §5, typy linii z 01 §4.2.

   Plik jest samodzielny (Babel w przeglądarce), więc powtarza znaczniki komponentów
   z katalogu components/ zamiast ich importować. Klasy CSS i tokeny są identyczne —
   w kodzie produkcyjnym importuj komponenty z components/. */

const { useState, useMemo } = React;

const URBAN = ["8,7","12,7","14,9","8,8","12,6","15,9"];
const LAKE = ["12,10","13,9","13,10","11,10"];
const MARSH = ["11,9","10,10","11,8","10,9","14,10"];
const XFOREST = ["3,5","5,5","7,9","6,10"];
const XMOUNT = ["4,0","0,1","4,2"];
const XSEA = ["16,0","16,1","20,3"];
const BIOME_LABEL = { nizina: "nizina", wyzyna: "wyżyna", gory: "góry", las: "las", bagno: "bagno", jezioro: "jezioro", morze: "morze", miasto: "teren zurbanizowany" };
const BIOME_MULT = { nizina: 1.0, wyzyna: 1.3, gory: 2.2, las: 1.4, bagno: 1.8, jezioro: 2.6, morze: 3.0, miasto: 1.9 };
const BIOMES = [
  { id: "nizina", label: "nizina ×1,0" }, { id: "wyzyna", label: "wyżyna ×1,3" },
  { id: "gory", label: "góry ×2,2" }, { id: "las", label: "las ×1,4" },
  { id: "bagno", label: "bagno ×1,8" }, { id: "jezioro", label: "jezioro ×2,6" },
  { id: "morze", label: "morze ×3,0" }, { id: "miasto", label: "zurbaniz. ×1,9" }
];
const TEX = {
  gory: '<path d="M-21 13 l8 -13 l8 13 z"/><path d="M3 13 l6 -9 l6 9 z"/>',
  wyzyna: '<path d="M-15 12 q7 -7 14 0" fill="none" stroke-width="1.6"/><path d="M2 15 q6 -5 12 0" fill="none" stroke-width="1.6"/>',
  las: '<path d="M-18 15 l4 -10 l4 10 z"/><path d="M-5 16 l4.5 -11 l4.5 11 z"/><path d="M9 15 l4 -10 l4 10 z"/>',
  bagno: '<path d="M-16 9 h11 M0 9 h11 M-9 15 h11" fill="none" stroke-width="1.8" stroke-linecap="round"/>',
  jezioro: '<path d="M-17 8 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/><path d="M-14 16 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/>',
  morze: '<path d="M-17 8 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/><path d="M-14 16 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/>',
  miasto: '<rect x="-16" y="6" width="5" height="9"/><rect x="-8" y="2" width="6" height="13"/><rect x="1" y="8" width="5" height="7"/><rect x="9" y="4" width="5" height="11"/>'
};
const HEX = "M-34 0 L-17 -29.5 L17 -29.5 L34 0 L17 29.5 L-17 29.5 Z";

function hash(c, r) { const h = (c * 73856093) ^ (r * 19349663); return Math.abs(h) % 100; }
function biomeAt(c, r) {
  const k = c + "," + r;
  if (URBAN.indexOf(k) > -1) return "miasto";
  if (c >= 1 && c <= 3 && r <= 3) return "gory";
  if (XMOUNT.indexOf(k) > -1) return "gory";
  if (c <= 6 && r <= 4) return "wyzyna";
  if (c >= 2 && c <= 6 && r >= 6 && r <= 9) return "las";
  if (XFOREST.indexOf(k) > -1) return "las";
  if (LAKE.indexOf(k) > -1) return "jezioro";
  if (MARSH.indexOf(k) > -1) return "bagno";
  if (c >= 17 && r <= 2) return "morze";
  if (XSEA.indexOf(k) > -1) return "morze";
  const h = hash(c, r);
  if (h % 13 === 0) return "wyzyna";
  if (h % 17 === 0) return "las";
  if (h % 29 === 0) return "bagno";
  return "nizina";
}
function buildWorld() {
  const out = [];
  for (let c = 0; c < 21; c++) for (let r = 0; r < 11; r++) {
    const x = 34 + 51 * c, y = (c % 2 ? 59 : 29.5) + 59 * r;
    if (y > 640) continue;
    out.push({ col: c, row: r, x: x, y: y, biome: biomeAt(c, r), wind: 5.2 + (hash(c, r) % 22) / 10, sun: 0.92 + (hash(r, c) % 12) / 100 });
  }
  return out;
}

const OBJECTS = [
  { x: 340, y: 383.5, kind: "coal", id: "coal", name: "EW JARNOWO", tech: "węgiel · 3 bloki" },
  { x: 544, y: 383.5, kind: "gas", id: "gas", name: "EC DOLINA", tech: "CCGT" },
  { x: 238, y: 88.5, kind: "wind", id: "wind", name: "FW GRZBIET", tech: "wiatr lądowy · 450 MW" },
  { x: 544, y: 619.5, kind: "pv", id: "pv", name: "PV ŁĘGI", tech: "PV · 120 MW" },
  { x: 391, y: 472, kind: "bess", id: "bess", name: "BESS POLANA", tech: "bateria · 150 MW / 300 MWh" },
  { x: 493, y: 413, kind: "node", id: "node", name: "WĘZEŁ ŚRODEK", tech: "stacja rozdzielcza · 1000 MW" },
  { x: 952, y: 442, kind: "border", id: "border", name: "GRANICA WSCHÓD", tech: "przyłącze graniczne · 500 MW" },
  { x: 442, y: 442, kind: "city", id: "jarnowo", name: "JARNOWO", tech: "miasto · 720 MW szczytu" },
  { x: 646, y: 442, kind: "town", id: "bystrzyca", name: "BYSTRZYCA", tech: "miasto · 465 MW szczytu" },
  { x: 748, y: 560.5, kind: "town", id: "krasnow", name: "KRASNÓW", tech: "miasto · 300 MW szczytu", alert: true }
];
const ICONS = {
  coal: '<rect x="-12" y="-4" width="24" height="10" fill="none" stroke="%C%" stroke-width="2"/><rect x="4" y="-14" width="5" height="10" fill="%C%"/>',
  gas: '<rect x="-11" y="-3" width="22" height="9" fill="none" stroke="%C%" stroke-width="2"/><path d="M-4 -8 L0 -14 L4 -8 Z" fill="%C%"/>',
  wind: '<path d="M0 2 L0 -14 M0 2 L13 9 M0 2 L-13 9" stroke="%C%" stroke-width="2.5" fill="none"/><circle cx="0" cy="2" r="2.5" fill="%C%"/>',
  pv: '<rect x="-11" y="-7" width="22" height="14" fill="none" stroke="%C%" stroke-width="2"/><path d="M-11 0 L11 0 M-3.7 -7 L-3.7 7 M3.7 -7 L3.7 7" stroke="%C%" stroke-width="1" fill="none"/>',
  bess: '<rect x="-10" y="-6" width="20" height="12" fill="none" stroke="%C%" stroke-width="2"/><rect x="10" y="-3" width="3" height="6" fill="%C%"/><rect x="-8" y="-4" width="11" height="8" fill="%C%" opacity="0.5"/>',
  node: '<g transform="rotate(45)"><rect x="-8" y="-8" width="16" height="16" fill="none" stroke="%C%" stroke-width="2"/></g>',
  city: '<rect x="-14" y="-4" width="7" height="13" fill="%C%"/><rect x="-4" y="-11" width="8" height="20" fill="%C%"/><rect x="7" y="-6" width="6" height="15" fill="%C%"/>',
  town: '<rect x="-11" y="-3" width="6" height="12" fill="%C%"/><rect x="-2" y="-9" width="7" height="18" fill="%C%"/>',
  border: '<path d="M-9 -6 L-1 0 L-9 6 M3 -6 L11 0 L3 6" stroke="%C%" stroke-width="2" fill="none"/>'
};
const ICON_TOKEN = { coal: "--en-coal-ico", gas: "--en-gas-ico", wind: "--en-wind", pv: "--en-pv", bess: "--en-ok", node: "--en-info", city: "--en-map-label-city", town: "--en-map-label-city", border: "--en-storage" };
function iconMarkup(kind) { return ICONS[kind].split("%C%").join("var(" + ICON_TOKEN[kind] + ")"); }

const TURNS = [
  { name: "NOC", hours: "00–03" }, { name: "PRZEDŚWIT", hours: "03–06" },
  { name: "RANO", hours: "06–09" }, { name: "PRZEDPOŁ.", hours: "09–12" },
  { name: "POŁUDNIE", hours: "12–15" }, { name: "POPOŁ.", hours: "15–18" },
  { name: "SZCZYT WIECZ.", hours: "18–21" }, { name: "PÓŹNY WIECZ.", hours: "21–24" }
];
const NEXT_RESERVE = [214, 388];
const FULL_NAME = { "SZCZYT WIECZ.": "SZCZYT WIECZORNY", "PRZEDPOŁ.": "PRZEDPOŁUDNIE", "POPOŁ.": "POPOŁUDNIE", "PÓŹNY WIECZ.": "PÓŹNY WIECZÓR" };

const CATALOG = [
  { name: "OCGT — turbina szczytowa", size: "120 MW", capex: 360, days: 1 },
  { name: "CCGT — blok gazowy", size: "400 MW", capex: 2200, days: 3 },
  { name: "Blok węglowy", size: "500 MW", capex: 4500, days: 5 },
  { name: "Blok jądrowy", size: "1200 MW", capex: 25200, days: 9 },
  { name: "Farma wiatrowa", size: "200 MW", capex: 720, days: 1 },
  { name: "Farma PV", size: "100 MW", capex: 180, days: 1 },
  { name: "Bateria BESS", size: "150 MW / 300 MWh", capex: 900, days: 1 },
  { name: "Stacja rozdzielcza", size: "250 MW · 6 przyłączy", capex: 150, days: 1 }
];
const LINE_TYPES = [
  { name: "NN", cap: "150 MW", loss: "4%/100 km", perKm: 1.2, hours: 3 },
  { name: "SN", cap: "500 MW", loss: "2%/100 km", perKm: 2.5, hours: 6 },
  { name: "WN", cap: "1500 MW", loss: "1%/100 km", perKm: 6.0, hours: 12 }
];

function fmtMln(v) { return v >= 1000 ? (v / 1000).toFixed(2).replace(".", ",") + " mld zł" : Math.round(v) + " mln zł"; }
function fmt1(v) { return v.toFixed(1).replace(".", ","); }

function DispatcherScreen() {
  const world = useMemo(buildWorld, []);
  const [turn, setTurn] = useState(6);
  const [coal, setCoal] = useState(800);
  const [gas, setGas] = useState(250);
  const [ocgt, setOcgt] = useState(0);
  const [bess, setBess] = useState("ODDAWAJ");
  const [imp, setImp] = useState(100);
  const [windOn, setWindOn] = useState(true);
  const [pvOn, setPvOn] = useState(true);
  const [sel, setSel] = useState(null);
  const [report, setReport] = useState(null);

  const demand = 1500;
  const windFc = windOn ? 320 : 0;
  const windBand = windOn ? 60 : 0;
  const bessMW = bess === "ODDAWAJ" ? 100 : bess === "ŁADUJ" ? -100 : 0;
  const plan = coal + gas + ocgt + windFc + Math.max(0, bessMW) + imp;
  const charging = Math.max(0, -bessMW);
  const losses = Math.round(plan * 0.029);
  const reserve = plan - losses - charging - demand;
  const tone = reserve < 0 ? "danger" : reserve < windBand ? "warn" : "ok";

  function commit() {
    const windReal = windOn ? 280 : 0;
    const covered = coal + gas + ocgt + windReal + Math.max(0, bessMW) + imp;
    const lost = Math.round(covered * 0.029);
    const delivered = Math.max(0, Math.min(demand, covered - lost - charging));
    const short = Math.max(0, demand - delivered);
    const revenue = (delivered * 3 * 650 * 10.9) / 1e6;
    const fuel = ((coal * 250 + gas * 350 + ocgt * 600 + imp * 800) * 3 * 10.9) / 1e6;
    const penalty = (short * 3 * 4000 * 10.9) / 1e6;
    setReport({ windReal: windReal, delivered: delivered, short: short, lost: lost, revenue: revenue, fuel: fuel, penalty: penalty, net: revenue - fuel - penalty });
    setTurn(function (t) { return (t + 1) % 8; });
  }

  const selObject = sel && OBJECTS.filter(function (o) { return Math.abs(o.x - sel.x) < 2 && Math.abs(o.y - sel.y) < 2; })[0];
  const turnName = FULL_NAME[TURNS[turn].name] || TURNS[turn].name;

  return (
    <div className="en-app">
      <div className="en-topbar">
        <div className="en-topbar__mark">⬡ ELECTRONATION</div>
        <div className="en-topbar__ctx">ROK 3 · LISTOPAD · DOBA ROBOCZA A <em>· REŻIM: NIŻ ATLANTYCKI</em></div>
        <div className="en-topbar__kpis">
          <div className="en-kpi">BUDŻET <b>7,42 mld zł</b></div>
          <div className="en-kpi">WYNIK DOBY <b className="is-ok">+46,9 mln</b></div>
          <div className="en-kpi">PROGNOZY <b>PODSTAWOWY · 24 H</b></div>
        </div>
      </div>

      <div className="en-body">
        <div className="en-main">
          <WorldMap world={world} sel={sel} onPick={setSel} />
          <div className="en-turnbar">
            {TURNS.map(function (t, i) {
              const cls = ["en-turn", i === turn ? "is-current" : "", i < turn ? "is-past" : ""].join(" ");
              return (
                <button className={cls} key={t.name} onClick={function () { setTurn(i); }}>
                  {t.name}<br />{t.hours}{i === turn ? " ◂ TURA " + (i + 1) : ""}
                </button>
              );
            })}
          </div>
          <DayChart />
        </div>

        {sel ? (
          <HexPanel hex={sel} object={selObject} onClose={function () { setSel(null); }} />
        ) : (
          <aside className="en-panel">
            <div className="en-panel__head">
              <div className="en-panel__meta">TURA {turn + 1}/8 · LISTOPAD · ×10,9 DNIA</div>
              <div className="en-panel__title">{turnName} <span>{TURNS[turn].hours}</span></div>
            </div>

            <section className="en-section">
              <div className="en-section__label">PROGNOZA · TURA {turn + 1}</div>
              <div className="en-stack">
                <Band label="POPYT" left={88} width={6} value="1500 ±33" />
                <Band label="WIATR" left={windOn ? 58 : 0} width={windOn ? 27 : 0} value={windOn ? "320 ±60" : "0 · WYŁ."} color="var(--en-wind)" />
                <Band label="PV" left={0} width={0} value="0 · NOC" muted />
              </div>
              <div className="en-section__label">BILANS PRZY OBECNYCH NASTAWACH</div>
              <div className="en-stack en-stack--tight">
                <div className="en-kv"><span>T{turn + 1} {TURNS[turn].name}</span><span className={"is-" + tone}>{(reserve >= 0 ? "+" : "") + reserve} MW {tone === "ok" ? "✓" : "⚠"}</span></div>
                {NEXT_RESERVE.map(function (r, i) {
                  const n = turn + 1 + i;
                  const label = n < 8 ? "T" + (n + 1) + " " + TURNS[n].name : "JUTRO · " + TURNS[n - 8].name;
                  return <div className="en-kv" key={i}><span>{label}</span><span className="is-ok">+{r} MW ✓</span></div>;
                })}
              </div>
            </section>

            <section className="en-section en-section--grow">
              <div className="en-section__label">NASTAWY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--en-space-5)" }}>
                <Setpoint name="EW JARNOWO" tech="węgiel" value={coal} max={900} note="250 zł/MWh" color="var(--en-coal-ico)" onChange={setCoal} />
                <Setpoint name="EC DOLINA" tech="CCGT" value={gas} max={400} note="350 zł/MWh" color="var(--en-gas-ico)" onChange={setGas} />
                <Setpoint name="OCGT ISKRA" tech="szczyt" value={ocgt} max={120} note="600 zł/MWh" color="var(--en-gas-ico)" onChange={setOcgt} />
                <div className="en-setpoint">
                  <div className="en-setpoint__head"><span>BESS POLANA <small>150 MW/300 MWh</small></span><span className={bessMW > 0 ? "is-ok" : bessMW < 0 ? "is-info" : "is-muted"}>{bessMW > 0 ? "−" + bessMW : bessMW < 0 ? "+" + -bessMW : "0"}</span></div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5, alignItems: "center" }}>
                    <div className="en-segmented">
                      {["ŁADUJ", "STOP", "ODDAWAJ"].map(function (m) {
                        return <button key={m} className={"en-seg" + (bess === m ? " is-active" : "")} onClick={function () { setBess(m); }}>{m}</button>;
                      })}
                    </div>
                    <span style={{ marginLeft: "auto", color: "var(--en-text-2)", fontFamily: "var(--en-font-mono)", fontSize: 9 }}>SOC</span>
                    <span style={{ width: 64, height: 6, background: "var(--en-bg-track)" }}><span style={{ display: "block", width: "62%", height: "100%", background: "var(--en-ok)" }} /></span>
                    <span className="is-ok" style={{ fontFamily: "var(--en-font-mono)", fontSize: 9 }}>62%</span>
                  </div>
                </div>
                <Setpoint name="IMPORT WSCHÓD" value={imp} max={500} note="800 zł/MWh" color="var(--en-storage)" onChange={setImp} />
                <Renewable name="FW GRZBIET" size="450 MW" on={windOn} value="~320 AUTO" onToggle={setWindOn} />
                <Renewable name="PV ŁĘGI" size="120 MW" on={pvOn} value="0" onToggle={setPvOn} muted />
              </div>
            </section>

            <section className="en-section en-section--sunk">
              <div className="en-summary">
                <div className="en-summary__row"><span>ZAPOTRZEBOWANIE</span><b>{demand}</b></div>
                <div className="en-summary__row"><span>STRATY PRZESYŁU</span><b>~{losses}</b></div>
                <div className="en-summary__row"><span>PLAN POKRYCIA</span><b>{plan}</b></div>
                <div className={"en-summary__total is-" + tone}><span>ZAPAS</span><span>{(reserve >= 0 ? "+" : "") + reserve} MW ({fmt1((reserve / demand) * 100)}%)</span></div>
                <div className={"en-summary__note is-" + tone}>
                  {reserve < 0 ? "✕ plan nie domyka bilansu — dołóż mocy albo importu" : reserve < windBand ? "⚠ dolne pasmo wiatru = −" + windBand + " MW → ryzyko niedoboru" : "✓ zapas pokrywa dolne pasmo prognozy wiatru"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: "var(--en-space-6)" }}>
                <button className="en-btn en-btn--block" onClick={commit}>ZATWIERDŹ TURĘ ▸</button>
                <button className="en-btn en-btn--ghost" onClick={commit}>PRZEWIŃ ⏭</button>
              </div>
            </section>
          </aside>
        )}
      </div>

      {report && (
        <div className="en-report">
          <div className="en-report__label">PO ZATWIERDZENIU<br /><b>ROZSTRZYGNIĘCIE<br />+ RAPORT</b></div>
          <div className="en-report__tiles">
            <Tile label="WIATR WSZEDŁ" value={report.windReal + " MW"} note="dolne pasmo (prog. 320)" tone="info" />
            <Tile label="DOSTARCZONO" value={report.delivered + " / " + demand} note={"straty " + report.lost + " MW"} />
            <Tile label="NIEDOBÓR" value={report.short ? report.short + " MW · KRASNÓW" : "0 MW"} note={report.short ? report.short * 3 + " MWh niedostarczone" : "wszystkie miasta zasilone"} tone={report.short ? "danger" : "ok"} />
            <Tile label="PRZYCHÓD" value={"+" + fmt1(report.revenue) + " mln"} note="650 zł/MWh × 10,9" tone="ok" />
            <Tile label="PALIWO+IMPORT" value={"−" + fmt1(report.fuel) + " mln"} />
            <Tile label="KARA" value={(report.penalty ? "−" + fmt1(report.penalty) : "0,0") + " mln"} note="4 000 zł/MWh" tone={report.penalty ? "danger" : undefined} />
            <Tile label="WYNIK TURY" value={(report.net >= 0 ? "+" : "") + fmt1(report.net) + " mln zł"} tone={report.net >= 0 ? "ok" : "danger"} highlight />
          </div>
        </div>
      )}
    </div>
  );
}

function Band(props) {
  return (
    <div className="en-statrow">
      <span className="en-statrow__label">{props.label}</span>
      <span className="en-statrow__track">{props.width > 0 && <span className="en-statrow__band" style={{ left: props.left + "%", width: props.width + "%", background: props.color || "var(--en-text-2)" }} />}</span>
      <span className="en-statrow__value" style={{ color: props.muted ? "var(--en-text-4)" : props.color || "var(--en-text)" }}>{props.value}</span>
    </div>
  );
}

function Setpoint(props) {
  const pct = (props.value / props.max) * 100;
  return (
    <div className={"en-setpoint" + (props.value ? "" : " is-off")}>
      <div className="en-setpoint__head">
        <span>{props.name} {props.tech && <small>{props.tech}</small>}</span>
        <span className={props.value ? "" : "is-muted"}>{props.value} / {props.max}</span>
      </div>
      <label className="en-setpoint__track" style={{ display: "block", position: "relative" }}>
        <span className="en-setpoint__fill" style={{ width: pct + "%", background: props.color }} />
        <span className="en-setpoint__thumb" style={{ left: pct + "%" }} />
        <input type="range" min="0" max={props.max} step="10" value={props.value} onChange={function (e) { props.onChange(Number(e.target.value)); }} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: 0, margin: 0, cursor: "ew-resize" }} />
      </label>
      {props.note && <div className="en-setpoint__note">{props.note}</div>}
    </div>
  );
}

function Renewable(props) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--en-font-mono)", fontSize: "var(--en-fs-base)", color: "var(--en-text)" }}>
      <span>{props.name} <span style={{ color: "var(--en-text-3)" }}>{props.size}</span></span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className={"en-pill" + (props.on ? "" : " is-off")} onClick={function () { props.onToggle(!props.on); }}>{props.on ? "WŁ." : "WYŁ."}</button>
        <span style={{ color: !props.on || props.muted ? "var(--en-text-4)" : "var(--en-wind)" }}>{props.on ? props.value : "0"}</span>
      </span>
    </div>
  );
}

function Tile(props) {
  return (
    <div className={"en-tile" + (props.highlight ? " en-tile--ok" : "")}>
      <div className={"en-tile__label" + (props.tone ? " is-" + props.tone : "")}>{props.label}</div>
      <div className={"en-tile__value" + (props.tone ? " is-" + props.tone : "")}>{props.value}</div>
      {props.note && <div className="en-tile__note">{props.note}</div>}
    </div>
  );
}

function HexPanel(props) {
  const hex = props.hex, object = props.object;
  const mult = BIOME_MULT[hex.biome];
  const hydro = hex.biome === "gory" || hex.biome === "wyzyna";
  return (
    <aside className="en-panel">
      <div className="en-panel__head">
        <div className="en-panel__meta">HEKS q{hex.col} r{hex.row} · 25 × 25 KM</div>
        <div className="en-panel__title">{object ? object.name : BIOME_LABEL[hex.biome].toUpperCase()} <span>{object ? "" : "×" + fmt1(mult)}</span></div>
      </div>
      <section className="en-section">
        <div className="en-section__label">TEREN</div>
        <div className="en-stack en-stack--tight">
          <div className="en-kv"><span>TYP</span><span>{BIOME_LABEL[hex.biome]}</span></div>
          <div className="en-kv"><span>MNOŻNIK KOSZTU</span><span>×{fmt1(mult)}</span></div>
          <div className="en-kv"><span>WIATR @100 M</span><span className="is-info">{fmt1(hex.wind)} m/s</span></div>
          <div className="en-kv"><span>NASŁONECZNIENIE</span><span>×{hex.sun.toFixed(2).replace(".", ",")}</span></div>
          <div className="en-kv"><span>SZCZYTOWO-POMPOWA</span><span className={hydro ? "is-ok" : "is-muted"}>{hydro ? "możliwa" : "brak warunków"}</span></div>
        </div>
      </section>
      {object ? (
        <section className="en-section en-section--grow">
          <div className="en-section__label">OBIEKT</div>
          <div className="en-stack en-stack--tight">
            <div className="en-kv"><span>RODZAJ</span><span>{object.tech}</span></div>
            <div className="en-kv"><span>STAN</span><span className={object.alert ? "is-danger" : "is-ok"}>{object.alert ? "niedobór 15 MW" : "praca normalna"}</span></div>
            <div className="en-kv"><span>PRZYŁĄCZA</span><span>2 / 6</span></div>
          </div>
          <div className="en-section__label">AKCJE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="en-btn en-btn--ghost en-btn--block">POPROWADŹ LINIĘ STĄD</button>
            <button className="en-btn en-btn--ghost en-btn--block">ROZBUDUJ (+1 BLOK)</button>
            {object.alert && <button className="en-btn en-btn--ghost en-btn--block">POKAŻ WĄSKIE GARDŁO</button>}
          </div>
        </section>
      ) : (
        <section className="en-section en-section--grow">
          <div className="en-section__label">KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {CATALOG.map(function (c) {
              return (
                <button key={c.name} className="en-seg" style={{ display: "flex", justifyContent: "space-between", textAlign: "left", padding: "6px 8px", fontSize: "var(--en-fs-sm)", width: "100%" }}>
                  <span style={{ color: "var(--en-text)" }}>{c.name}<br /><span style={{ color: "var(--en-text-4)", fontSize: "var(--en-fs-micro)" }}>{c.size} · {c.days} {c.days === 1 ? "doba" : "doby"} budowy</span></span>
                  <span style={{ color: "var(--en-text-2)", whiteSpace: "nowrap" }}>{fmtMln(c.capex * mult)}</span>
                </button>
              );
            })}
          </div>
          <div className="en-section__label">LINIA Z TEGO HEKSA</div>
          <div className="en-stack en-stack--tight">
            {LINE_TYPES.map(function (l) {
              return (
                <div className="en-kv" key={l.name}>
                  <span>{l.name} · {l.cap} · {l.loss}</span>
                  <span>{fmt1(l.perKm * 25 * mult)} mln / heks · {l.hours} h</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="en-section en-section--sunk">
        <button className="en-btn en-btn--ghost en-btn--block" onClick={props.onClose}>◂ WRÓĆ DO PANELU DYSPOZYTORA</button>
      </section>
    </aside>
  );
}

const LINES = [
  { fromHex: [6, 6], toHex: [9, 6], type: "WN", load: "ok" },
  { fromHex: [9, 6], toHex: [8, 7], type: "SN", load: "warn" },
  { fromHex: [9, 6], toHex: [12, 7], type: "SN", load: "warn" },
  { fromHex: [12, 7], toHex: [14, 9], type: "NN", load: "over" },
  { fromHex: [4, 1], toHex: [9, 6], type: "SN", load: "ok" },
  { fromHex: [10, 6], toHex: [9, 6], type: "SN", load: "ok" },
  { fromHex: [10, 10], toHex: [9, 6], type: "NN", load: "idle" },
  { fromHex: [7, 7], toHex: [9, 6], type: "NN", load: "ok" },
  { fromHex: [18, 7], toHex: [12, 7], type: "SN", load: "ok" }
];
const CORRIDOR_SPACING = 9;
function hexCenterPx(col, row) { return { x: 34 + 51 * col, y: (col % 2 ? 59 : 29.5) + 59 * row }; }
function toCube(col, row) { const x = col, z = row - ((col - (col & 1)) / 2); return { x: x, y: -x - z, z: z }; }
function fromCube(c) { return { col: c.x, row: c.z + ((c.x - (c.x & 1)) / 2) }; }
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}
function hexLine(a, b) {
  const A = toCube(a[0], a[1]), B = toCube(b[0], b[1]);
  const N = Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    out.push(fromCube(cubeRound(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t)));
  }
  return out;
}
function routeLines(lines) {
  const paths = lines.map(function (l) { return hexLine(l.fromHex, l.toHex); });
  const corridors = {};
  paths.forEach(function (p, li) {
    for (let i = 0; i < p.length - 1; i++) {
      const ka = p[i].col + "," + p[i].row, kb = p[i + 1].col + "," + p[i + 1].row;
      const key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      (corridors[key] = corridors[key] || []).push(li);
    }
  });
  return paths.map(function (p, li) {
    const vecs = [];
    for (let i = 0; i < p.length - 1; i++) {
      const ka = p[i].col + "," + p[i].row, kb = p[i + 1].col + "," + p[i + 1].row;
      const key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const users = corridors[key];
      const off = (users.indexOf(li) - (users.length - 1) / 2) * CORRIDOR_SPACING;
      const first = ka < kb ? p[i] : p[i + 1], second = ka < kb ? p[i + 1] : p[i];
      const c1 = hexCenterPx(first.col, first.row), c2 = hexCenterPx(second.col, second.row);
      const dx = c2.x - c1.x, dy = c2.y - c1.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      vecs.push({ x: (-dy / len) * off, y: (dx / len) * off });
    }
    return p.map(function (h, j) {
      const c = hexCenterPx(h.col, h.row);
      const v = p.length === 1 ? { x: 0, y: 0 }
        : j === 0 ? vecs[0]
        : j === p.length - 1 ? vecs[vecs.length - 1]
        : { x: (vecs[j - 1].x + vecs[j].x) / 2, y: (vecs[j - 1].y + vecs[j].y) / 2 };
      return [Math.round((c.x + v.x) * 10) / 10, Math.round((c.y + v.y) * 10) / 10];
    });
  });
}
const ROUTES = routeLines(LINES);
function pointsAttr(pts) { return pts.map(function (p) { return p[0] + "," + p[1]; }).join(" "); }
const LABELS = [
  { x: 340, y: 432, text: "EW JARNOWO · 800/900" },
  { x: 544, y: 352, text: "EC DOLINA · 250/400" },
  { x: 238, y: 134, text: "FW GRZBIET · ~320" },
  { x: 544, y: 596, text: "PV ŁĘGI · 0" },
  { x: 391, y: 518, text: "BESS · −100 · SOC 62%" },
  { x: 493, y: 458, text: "WĘZEŁ · 870/1000" },
  { x: 952, y: 488, text: "GRANICA WSCHÓD · +100" },
  { x: 442, y: 490, text: "JARNOWO · 720 MW", tone: "city" },
  { x: 646, y: 490, text: "BYSTRZYCA · 465 MW", tone: "city" },
  { x: 748, y: 608, text: "KRASNÓW · 300 MW", tone: "danger" }
];
const LOAD = { ok: "--en-ok", warn: "--en-warn", over: "--en-danger", idle: "--en-idle" };
const WIDTH = { NN: 2.5, SN: 4, WN: 6 };

function WorldMap(props) {
  const byBiome = {};
  props.world.forEach(function (h) { (byBiome[h.biome] = byBiome[h.biome] || []).push(h); });
  const sel = props.sel;
  return (
    <svg viewBox="0 0 1060 640" style={{ display: "block", width: "100%", background: "var(--en-bg-map)" }}>
      {BIOMES.map(function (b) {
        return byBiome[b.id] ? (
          <g key={b.id} fill={"var(--en-biome-" + b.id + "-fill)"} stroke={"var(--en-biome-" + b.id + "-edge)"} strokeWidth="1">
            {byBiome[b.id].map(function (h) {
              return <path key={h.col + "," + h.row} d={HEX} transform={"translate(" + h.x + " " + h.y + ")"} style={{ cursor: "pointer" }} onClick={function () { props.onPick(h); }} />;
            })}
          </g>
        ) : null;
      })}
      {BIOMES.map(function (b) {
        return byBiome[b.id] && TEX[b.id] ? (
          <g key={"t" + b.id} fill={"var(--en-biome-" + b.id + "-tex)"} stroke={"var(--en-biome-" + b.id + "-tex)"} opacity="0.62" style={{ pointerEvents: "none" }}>
            {byBiome[b.id].map(function (h) {
              return <g key={h.col + "," + h.row} transform={"translate(" + h.x + " " + h.y + ")"} dangerouslySetInnerHTML={{ __html: TEX[b.id] }} />;
            })}
          </g>
        ) : null;
      })}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
        {ROUTES.map(function (pts, i) {
          return <polyline key={i} points={pointsAttr(pts)} stroke={"var(" + LOAD[LINES[i].load] + ")"} strokeWidth={WIDTH[LINES[i].type]} strokeDasharray={LINES[i].load === "idle" ? "4 4" : undefined} />;
        })}
      </g>
      <text x="712" y="516" fill="var(--en-danger)" fontSize="11" fontFamily="var(--en-font-mono)" fontWeight="600" paintOrder="stroke" stroke="var(--en-bg-map)" strokeWidth="3.5" style={{ pointerEvents: "none" }}>NN 150/150 ⚠</text>
      {sel && <path d={HEX} transform={"translate(" + sel.x + " " + sel.y + ")"} fill="none" stroke="var(--en-action)" strokeWidth="3" style={{ pointerEvents: "none" }} />}
      <g fill="none" style={{ pointerEvents: "none" }}>
        {OBJECTS.map(function (o) {
          return <path key={o.id} d={HEX} transform={"translate(" + o.x + " " + o.y + ")"} stroke={o.alert ? "var(--en-danger)" : o.kind === "city" || o.kind === "town" ? "var(--en-city-ring)" : "var(--en-obj-ring)"} strokeWidth={o.kind === "city" || o.kind === "town" || o.alert ? 3 : 2} />;
        })}
      </g>
      <g fill="var(--en-map-pad)" opacity="var(--en-map-pad-opacity)" style={{ pointerEvents: "none" }}>
        {OBJECTS.map(function (o) { return <circle key={o.id} cx={o.x} cy={o.y} r={o.kind === "city" ? 19 : 17} />; })}
      </g>
      <g style={{ pointerEvents: "none" }}>
        {OBJECTS.map(function (o) { return <g key={o.id} transform={"translate(" + o.x + " " + o.y + ")"} dangerouslySetInnerHTML={{ __html: iconMarkup(o.kind) }} />; })}
      </g>
      <g fontFamily="var(--en-font-mono)" fontSize="10.5" textAnchor="middle" paintOrder="stroke" stroke="var(--en-bg-map)" strokeWidth="3.5" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
        {LABELS.map(function (l, i) {
          return <text key={i} x={l.x} y={l.y} fill={"var(" + (l.tone === "city" ? "--en-map-label-city" : l.tone === "danger" ? "--en-danger-text" : "--en-map-label") + ")"} fontWeight={l.tone ? 600 : 400}>{l.text}</text>;
        })}
      </g>
      <rect x="0" y="0" width="1060" height="34" fill="var(--en-bg-app)" opacity="0.9" style={{ pointerEvents: "none" }} />
      <g fontFamily="var(--en-font-mono)" style={{ pointerEvents: "none" }}>
        {BIOMES.map(function (b, i) {
          return (
            <g key={b.id}>
              <path d="M-9 0 L-4.5 -7.8 L4.5 -7.8 L9 0 L4.5 7.8 L-4.5 7.8 Z" transform={"translate(" + (26 + i * 126) + " 17)"} fill={"var(--en-biome-" + b.id + "-fill)"} stroke={"var(--en-biome-" + b.id + "-edge)"} strokeWidth="1.2" />
              <text x={41 + i * 126} y="21" fontSize="10" fill="var(--en-map-label)">{b.label}</text>
            </g>
          );
        })}
      </g>
      <rect x="8" y="576" width="176" height="56" fill="var(--en-bg-app)" opacity="0.9" style={{ pointerEvents: "none" }} />
      <g transform="translate(20 592)" fontFamily="var(--en-font-mono)" fontSize="9.5" fill="var(--en-map-label)" style={{ pointerEvents: "none" }}>
        <path d="M0 4 L26 4" stroke="var(--en-idle)" strokeWidth="2.5" /><text x="32" y="8">NN 150</text>
        <path d="M0 20 L26 20" stroke="var(--en-idle)" strokeWidth="4" /><text x="32" y="24">SN 500</text>
        <path d="M0 36 L26 36" stroke="var(--en-idle)" strokeWidth="6" /><text x="32" y="40">WN 1500</text>
        <circle cx="96" cy="4" r="4" fill="var(--en-ok)" /><text x="106" y="8">OK</text>
        <circle cx="96" cy="20" r="4" fill="var(--en-warn)" /><text x="106" y="24">&gt;75%</text>
        <circle cx="96" cy="36" r="4" fill="var(--en-danger)" /><text x="106" y="40">LIMIT</text>
      </g>
      <text x="1044" y="628" textAnchor="end" fontFamily="var(--en-font-mono)" fontSize="10" fill="var(--en-map-scale)" style={{ pointerEvents: "none" }}>1 HEKS = 25 KM</text>
    </svg>
  );
}

function DayChart() {
  return (
    <div>
      <svg viewBox="0 0 1060 130" style={{ display: "block", width: "100%", background: "var(--en-bg-chart)", borderTop: "1px solid var(--en-border)" }}>
        <defs>
          <linearGradient id="enGenKit" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--en-coal)" /><stop offset="0.55" stopColor="var(--en-coal)" />
            <stop offset="0.55" stopColor="var(--en-gas)" /><stop offset="0.72" stopColor="var(--en-gas)" />
            <stop offset="0.72" stopColor="var(--en-wind)" /><stop offset="0.92" stopColor="var(--en-wind)" />
            <stop offset="0.92" stopColor="var(--en-storage)" /><stop offset="1" stopColor="var(--en-storage)" />
          </linearGradient>
        </defs>
        <g stroke="var(--en-border-subtle)">
          {[132.5, 265, 397.5, 530, 662.5, 795, 927.5].map(function (x) { return <path key={x} d={"M" + x + " 0 V130"} />; })}
        </g>
        <rect x="795" y="0" width="132.5" height="130" fill="var(--en-action)" opacity="0.07" />
        <polygon points="0,70 44,74 88,76 132,76 177,74 221,68 265,57 309,47 353,43 397,44 442,44 486,45 530,46 574,47 618,46 663,43 707,33 751,21 795,15 795,130 0,130" fill="url(#enGenKit)" opacity="0.65" />
        <polyline points="0,70 44,74 88,76 132,76 177,74 221,68 265,57 309,47 353,43 397,44 442,44 486,45 530,46 574,47 618,46 663,43 707,33 751,21 795,15" fill="none" stroke="var(--en-text)" strokeWidth="2" />
        <polygon points="795,15 839,12 883,18 928,28 972,40 1016,47 1060,53 1060,72 1016,64 972,55 928,41 883,30 839,21" fill="var(--en-wind)" opacity="0.14" />
        <polyline points="795,15 839,16 883,23 928,34 972,47 1016,55 1060,62" fill="none" stroke="var(--en-wind)" strokeWidth="1.5" strokeDasharray="5 4" />
        <path d="M795 0 V130" stroke="var(--en-action)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="801" y="12" fill="var(--en-action)" fontSize="10" fontFamily="var(--en-font-mono)">TERAZ</text>
        <text x="8" y="14" fill="var(--en-text-4)" fontSize="10" fontFamily="var(--en-font-mono)">DOBA · POPYT vs POKRYCIE [MW]</text>
      </svg>
      <div className="en-chartlegend">
        <span><span className="en-swatch" style={{ background: "var(--en-coal)" }} /> WĘGIEL</span>
        <span><span className="en-swatch" style={{ background: "var(--en-gas)" }} /> GAZ</span>
        <span><span className="en-swatch" style={{ background: "var(--en-wind)" }} /> WIATR</span>
        <span><span className="en-swatch" style={{ background: "var(--en-storage)" }} /> IMPORT/MAGAZYN</span>
        <span style={{ marginLeft: "auto" }}>— PRAWDA · ┄ PROGNOZA (PASMO)</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<DispatcherScreen />);
