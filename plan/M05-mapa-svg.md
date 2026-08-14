# M5 — Mapa SVG: scene model → renderer

**Warstwa:** UI (`src/app/`). **Zależności:** M2 (mapa v1 z terenem), M4 (rama).
**Przeczytaj najpierw:** `CLAUDE.md` (kontrakt scene-model!), `plan/README.md`,
docs 01 §3.1, §8 pkt 1; `design-system/components/map/HexMap.jsx` + `.d.ts`
+ `.prompt.md` + `routing.js`, `design-system/guidelines/brand-lines.html`,
`brand-objects.html`, `brand-motion.html`, `colors-biomes-*.html`;
`src/engine/state.ts` (`TurnReport.segments` z `fromIndex`/`toIndex`),
`src/engine/network.ts` (`HexCoord` — osiowe!).

## Cel

Mapa gry renderuje się z czystego modelu sceny: heksy z biomami, obiekty, linie
w kolorach obciążenia z raportu tury, miasta w niedoborze, budowy w toku, pan/zoom.
Zgodność wizualna z `HexMap` handoffu; dane wyłącznie z silnika.

## Zakres

### 1. Scene model (czysta funkcja + snapshot testy)

`src/app/map/sceneModel.ts`: `buildMapScene(game: GameState, report: TurnReport |
null, selected: HexCoord | null): MapScene` — czyste dane (JSON-owalne), zero JSX.
Testy snapshotują scene model, nie SVG (konwencja z `CLAUDE.md`).

- **Współrzędne — pułapka nr 1**: silnik używa **osiowych** `{q, r}` (01 §3.1),
  design liczy geometrię w **odd-q offset** `{col, row}` (`routing.js`:
  `hexCenter`, konwersja cube z `z = row - ((col - (col&1))/2)`). Napisz jawny
  konwerter `axialToOffset` (col = q, row = r + (q − (q&1))/2) w jednym miejscu,
  z testami na kilku heksach, i używaj geometrii designu bez modyfikacji:
  `HEX_R=34`, `STEP_X=51`, `STEP_Y=59`, `HEX_PATH` (stałe przenieś z `routing.js`).
- Heksy: biom per heks z `GameState.terrain` — mapowanie `TerrainId` (EN, silnik)
  → slug tokenów (PL, design): plains→nizina, forest→las, highlands→wyzyna,
  swamp→bagno, urban→miasto, mountains→gory, lake→jezioro, sea→morze. Etykiety
  legendy biomów generuj z `TERRAIN` w `config.ts` (mnożniki ×2,5 góry / ×3,5
  morze itd.) — **mnożniki wpisane w `BIOMES` handoffu są nieaktualne, nie
  kopiuj ich** (kanon: 02 §8.1).
- Linie: silnik daje **jawną trasę** `line.path` (łańcuch heksów) — polilinia
  przez środki heksów trasy; NIE używaj interpolacji `hexLine` z designu
  (ona zgaduje trasę, my ją znamy). Rozłożenie równoległych linii we wspólnym
  korytarzu: odsunięcie prostopadłe co 9 px (`CORRIDOR_SPACING`), symetrycznie;
  przy >6 równoległych zmniejsz odstęp tak, by wachlarz mieścił się w heksie
  (`.prompt.md` sam wskazuje ten problem: 9×9 px > 59 px).
- Obciążenie linii z `report.segments`: `usedMw / capacityMw` per **segment**
  (indeksy `fromIndex`/`toIndex` tną trasę na odcinki o różnym obciążeniu);
  progi: `ok` ≤ 0,75 · `warn` > 0,75 · `over` ≥ 0,995 · `idle` gdy przepływ ~0
  (kreskowanie `4 4`). Szerokość = typ: lv 2,5 / mv 4 / hv 6 px. Bez raportu
  (start gry) wszystkie linie `idle`. Dwa kody są ortogonalne — nigdy nie mieszaj
  (brand-lines).
- Obiekty (pierścień + krążek + ikona — biom zawsze widoczny w rogach): zestaw
  ikon z `HexMap.jsx` (`ICONS`: coal, gas, wind, pv, bess, node, city, town,
  border). **Brakuje ikony jądrowej** — dorysuj nową ikonę liniową w tej samej
  konwencji (stroke 2 px, ⌀34 px), zestaw jest zamknięty, żadnych bibliotek.
  OCGT używa ikony gazu (technologia to sufiks etykiety).
- Miasto w niedoborze (`report.cities[].ensMw > 0`): czerwony pierścień 3 px
  i etykieta w tonie danger — **bez migania i bez animacji** (brand-motion;
  `.d.ts` wspomina pulsowanie — to martwy zapis, ignoruj).
- Budowa w toku (`constructions`, linie z `builtHours < totalHours`): przedstaw
  statycznie w konwencji systemu — obiekt: pierścień w `--en-idle` + etykieta
  `BUDOWA · <n> DÓB`; linia: kreskowana w `--en-idle` + etykieta postępu.
  To rozszerzenie poza design (nie ma go w handoffie) — trzymaj się tokenów
  i reguł copy, odnotuj w komentarzu do decyzji projektanta.
- Etykiety pod heksem, mono 10,5 px, halo `paint-order: stroke` 3,5 px; formaty
  z próbek designu: `EW JASIENICA · 320/400`, `JASIENICA · 95 MW`,
  `BESS · −100 · SOC 62%`. Nazwy obiektów ze stanu (są danymi gracza, polskie).
- Nakładki: legenda biomów (górny pas), legenda linii (lewy dół), skala
  `1 HEKS = 25 KM` (prawy dół), etykieta przeciążenia (np. `SN 500/500 ⚠`)
  przy najgorętszym segmencie (`pointer-events: none`).
- Zaznaczenie: obrys heksa w `--en-action`, szer. 3 (wzór z buildu referencyjnego).

### 2. Renderer

`src/app/map/HexMapView.tsx`: `MapScene` → jeden `<svg>`; kolejność warstw jak
w `HexMap.jsx` (biomy → tekstury → linie → pierścienie/krążki/ikony → etykiety →
nakładki). Tekstury biomów i ikony jako stałe SVG (przenieś z handoffu; w TSX
zamiast `dangerouslySetInnerHTML` preferuj komponenty/elementy JSX).

- **Pan/zoom = jedna transformacja na grupie root** (`CLAUDE.md`): drag do pana,
  kółko do zooma (clamp), bez bibliotek. Nakładki (legendy, skala) poza grupą
  transformowaną — przyklejone do viewportu.
- Klik heksa → `store.selectedHex` (panel heksa dopiero w M7 — na razie
  zaznaczenie wizualne). Klik w `<path>` heksa jak w handoffie.
- Mapa 24×16 nie mieści się w 1060×640 przy r=34 — startowy widok: całość mapy
  (fit), zoom do 1:1.

### 3. Poza zakresem

Panel heksa (M7), trasowanie linii (M7), animacje (decyzja projektanta w toku —
nagłówek `tokens/motion.css`), Canvas/Pixi (kontrakt scene-model trzyma tę opcję
otwartą na później).

## Kryteria akceptacji / testy

1. Snapshot testy scene modelu: mapa v1 bez raportu (wszystko idle); stan
   z raportem fixture (segmenty w 3 tonach, miasto z ENS, budowa w toku);
   konwersja osiowe→offset (tabelka przypadków, w tym ujemne/nieparzyste q).
2. Test progów obciążenia i mapowania biomów (funkcje czyste).
3. Testy komponentowe renderera: klik heksa ustawia selekcję; liczba elementów
   linii zgadza się z modelem.
4. e2e: mapa widoczna, klik heksa zaznacza (atrybut/klasa), brak błędów konsoli.
5. Wizualna zgodność z kartami `guidelines/` (ręczny przegląd obu motywów —
   odnotuj w opisie PR/podsumowaniu).
6. Zasady wspólne z `plan/README.md`.
