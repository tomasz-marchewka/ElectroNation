# M6 — Pętla tury: panel dyspozytora, nastawy, rozstrzygnięcie

**Warstwa:** UI (`src/app/`). **Zależności:** M4 (rama, store), M5 (mapa —
kolory obciążenia po rozstrzygnięciu). Po tym kamieniu gra jest grywalna.
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §2.2–2.4, §4.1,
§8; 06 §8.6.4; `design-system/ui_kits/dispatcher/DispatcherScreen.jsx` (spec
zachowań — ale jego matematyka bilansu to atrapa!), komponenty
`design-system/components/{controls,data}/*` (`.d.ts` + `.prompt.md` każdego),
`src/engine/forecast.ts` (`projectBalance`, prognozy), `src/engine/state.ts`
(`TurnReport`).

## Cel

Widok ciągły z 01 §2.3: prognoza, nastawy (edytowalne cały czas) i raport
ostatniej tury współistnieją; jedyną akcją przechodzącą czas jest
`ZATWIERDŹ TURĘ ▸`. Wszystkie liczby z silnika — build referencyjny handoffu
jest wzorem układu i zachowań, ale jego stałe (`demand=1500`, straty 2,9%,
`windReal=280`, `NEXT_RESERVE`) to atrapy do wyrzucenia.

## Zakres

### 1. Komponenty danych i kontrolek (adaptacja jak w M4)

`SetpointSlider` (krok 10 MW, kciuk 3×12 px, natywny range nałożony na tor),
`SegmentedControl` (max 3 opcje), `TogglePill`, `ForecastRow` (tor + pasmo
`[value−band, value+band]` w skali `[min,max]`), `BalanceSummary`, `ReportStrip`
— TypeScript, kontrakty z `.d.ts`.

### 2. Panel dyspozytora (prawa kolumna, stan domyślny)

Sekcje (limit 4 — `PanelSection.prompt.md`; kolejność kanoniczna):

1. **`PROGNOZA · TURA n`** — trzy `ForecastRow` dla nadchodzącej tury (średnie
   bloku): POPYT = suma prognoz przyłączonych miast (`cityDemandForecast`
   per godzina bloku, uśrednione; pasma sumowane — błąd systemowy), WIATR i PV =
   suma prognoz włączonych farm (`farmProductionForecast`); farma wyłączona
   znika z pasma i planu całkowicie (zachowanie z buildu referencyjnego, zgodne
   z 01 §4.1). PV nocą: nota `0 · NOC` zamiast pasma (wzór z designu).
   Pod spodem `BILANS PRZY OBECNYCH NASTAWACH`: wiersze dla tej tury i dwóch
   następnych — **z `projectBalance`** (średnie bloków z punktów godzinowych);
   ton wiersza: `danger` gdy `expectedBalanceMw < 0`, `warn` gdy
   `worstCaseBalanceMw < 0`, inaczej `ok` (odpowiednik reguły „zapas < pasmo
   wiatru" z designu, ale liczony poprawnie przez silnik).
2. **`NASTAWY`** (`grow`, przewijalna) — po jednym wierszu na jednostkę,
   z realnych obiektów stanu: elektrownie → `SetpointSlider` (0..capacityMw,
   kolor technologii, nota z kosztem zmiennym `250 zł/MWh` z `PLANT_TECHS`;
   zmiana → `dispatch({type:"setPlantSetpoint"...})`); magazyny → blok:
   `SegmentedControl` ŁADUJ/STOP/ODDAWAJ (`charge/idle/discharge`) + slider mocy
   0..powerMw + pasek SOC (`socMwh/capacityMwh`, format `SOC 62%`); farmy →
   `TogglePill` WŁ./WYŁ. + wartość prognozy `~320 AUTO`; granice → slider
   IMPORT 0..throughput oraz **slider EKSPORT** (eksportu nie ma w designie,
   a jest w docs 01 §5.7 i silniku — dodaj w tej samej konwencji, nota
   `150 zł/MWh`; rozszerzenie odnotuj komentarzem).
3. **`BUDOWY`** — kompaktowa lista `constructions` + linii w budowie (nazwa,
   pozostałe doby/godziny), sekcja znika, gdy pusto. Wymagana przez 01 §8 pkt 5
   (harmonogram budów w stale widocznym panelu), w designie jej nie ma —
   rozszerzenie w konwencji systemu, do przeglądu projektanta.
4. **Sekcja `sunk` (ostatnia)** — `BalanceSummary`: ZAPOTRZEBOWANIE (prognoza
   bloku), PLAN POKRYCIA (`dispatchableMw + resMw` z projekcji), ZAPAS
   (`expectedBalanceMw`, ton jak wyżej) + wiersz diagnozy wskazujący źródło
   liczby (np. `⚠ dolne pasmo OZE = −38 MW → ryzyko niedoboru`) — reguła
   „diagnoza, nie alarm". **Strat nie prognozujemy** (projekcja jest świadomie
   ślepa na sieć — 06 §8.6.4 wymaga bilansu, nie rozpływu); nie wstawiaj
   atrapy 2,9%. Pod spodem przyciski: `ZATWIERDŹ TURĘ ▸` (primary — jedyny
   na ekranie) i `PRZEWIŃ ⏭` (ghost, **disabled do M8**, tooltip po polsku).

Nagłówek panelu: `TURA n/8 · <MIESIĄC> · ×10,9 DNIA` (waga z `DAY_WEIGHTS` wg
typu doby — doba wolna ma ×8,7, design tego nie pokazywał) + nazwa tury + godziny.

### 3. Rozstrzygnięcie i raport

- `ZATWIERDŹ TURĘ ▸` → `store.resolve()` → mapa przebarwia się z nowego
  `lastTurnReport` (M5), panel pokazuje prognozę kolejnej tury, a na dole ekranu
  pojawia się **`ReportStrip`** (pełna szerokość, akcent 2 px) z kafelkami
  w kolejności pogoda → dostawa → niedobór → pieniądze → wynik:
  1. `WIATR REALNY` — `forecastMiss.wind.actualMw` z notą `PROGNOZA <x> ±<pasmo>`,
  2. `DOSTARCZONO` — `totals.deliveredMw / totals.demandMw`,
  3. `NIEDOBÓR` — `totals.ensMw` (+ nota z nazwami miast z `cities[].ensMw > 0`),
  4. `PRZYCHÓD` — `revenueEnergyPln + revenueExportPln`,
  5. `KOSZTY` — `fuelCostPln + importCostPln` (+ `fixedCostPln` w nocie na koniec
     doby: `+ KOSZTY STAŁE <x>`),
  6. `KARY` — `ensPenaltyPln + dumpPenaltyPln` (nota rozbija ENS/zrzut; zrzut
     nie istniał w designie — jest w 02 §5, pokaż go),
  7. `WYNIK TURY` — `finance.netPln`, `highlight` gdy dodatni.
- Raport ostatniej tury jest też trwałym elementem widoku (01 §2.3) — po
  wczytaniu stanu z `lastTurnReport ≠ null` pas raportu jest widoczny od razu.
- **Zero animacji rozstrzygnięcia**: interfejs jest statyczny (decyzja design
  systemu — nagłówek `tokens/motion.css`; „kinowa faza rozstrzygnięcia" czeka
  na decyzję projektanta). Nie wymyślaj przejść; zmiana stanu mapy + pojawienie
  się raportu to całość inscenizacji w v1.
- Pasek tur: bieżąca komórka `is-current` (+ ` ◂ TURA n`), wcześniejsze
  `is-past`; komórki przyszłe **nieaktywne do M8** (docs 01 §2.5 definiują
  przewijanie — build referencyjny pozwalał na swobodne skakanie tylko demo).
  Rozstrzygniętej tury nie da się cofnąć (pytanie otwarte z README handoffu —
  rozstrzygnięcie: nie, replay to protokół akcji, nie mechanika gry).

### 4. Poza zakresem

Panel heksa i budowanie (M7), wykres doby (M8), przewijanie (M8), zapis (M9).

## Kryteria akceptacji / testy

1. Testy komponentowe (Testing Library, stan silnika z małego scenariusza
   testowego — wzór `makeScenario` z testów silnika): suwak dispatchuje
   `setPlantSetpoint` z krokiem 10; przełącznik farmy usuwa ją z pasma OZE;
   segmented ustawia tryb magazynu; commit woła `resolveTurn` i wypełnia pas
   raportu wartościami z `lastTurnReport` (porównanie liczbowe z raportem, nie
   ze stałymi).
2. Test selektorów agregujących prognozy (czyste funkcje, porównanie z ręcznie
   policzonymi sumami z API silnika).
3. Test tonów bilansu (fixture z `projectBalance` → danger/warn/ok).
4. e2e: ustaw nastawę → zatwierdź turę → raport widoczny, budżet się zmienił,
   licznik tury wskoczył; dwa motywy renderują się bez błędów.
5. Copy: wyłącznie polskie, bezosobowe, format liczb z `format.ts`, glify tylko
   z dozwolonego zestawu (przejrzyj stringi — reguły w `plan/README.md`).
6. Zasady wspólne z `plan/README.md`.
