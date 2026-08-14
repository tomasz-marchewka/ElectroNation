# M8 — Wykres doby i przewijanie tur

**Warstwa:** UI + mała zmiana silnika (historia tur doby). **Zależności:** M6.
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §2.5, §8 pkt 2;
`design-system/components/chart/DayChart.jsx` + `.d.ts` + `.prompt.md`;
`src/engine/state.ts`, `src/engine/engine.ts` (`resolveTurn`),
`src/engine/forecast.ts`.

## Cel

Pas wykresu pokazuje dobę: prawda pokrycia warstwami technologii za nami,
prognoza z pasmem przed nami (01 §8 pkt 2). Gracz przewija czas: do wybranej
tury albo „aż coś się stanie" (01 §2.5). Pasek górny zyskuje KPI `WYNIK DOBY`.

## Zakres

### 1. Silnik: historia tur bieżącej doby

- Nowe pole `GameState.dayReports: TurnReport[]` — `resolveTurn` dopisuje raport
  rozstrzygniętej tury; przy przejściu doby tablica zaczyna się od nowa (raport
  ostatniej tury doby poprzedniej pozostaje w `lastTurnReport`). Serializowalne,
  deterministyczne; bump `STATE_SCHEMA_VERSION` (+ wpis migracji, jeśli M9 już
  scalone), goldeny przegrane z przeglądem diffa.
- To zasila: wykres doby (warstwy z `sources` per tura), KPI `WYNIK DOBY`
  (suma `finance.netPln` po `dayReports`) i warunki stopu przewijania.

### 2. Wykres doby (adaptacja `DayChart`)

`src/app/chart/`: czysty builder modelu wykresu (+ snapshot testy) i komponent SVG.

- Oś X = 24 h doby (8 bloków po 3 h, pionowe podziałki co blok, blok bieżący
  podświetlony `--en-action` @ 0.07, kreskowana pionowa linia `TERAZ`).
- **Za nami** (z `dayReports`): pokrycie warstwami jako schodki blokowe
  (średnie bloku, twarde przejścia — bez wygładzania): kolejność merit-order
  od dołu: jądrowa → węgiel → gaz (CCGT+OCGT) → wiatr → PV → magazyn → import
  (docs 01 §8 pkt 2 wymienia 7 warstw; wykres designu miał tylko 4 — docs
  wygrywają). Grupowanie per technologia z `sources[].kind` + tech obiektu ze
  stanu. Linia prawdy = `totals.demandMw` (popyt) w `--en-text`.
  **Brak tokenu koloru jądrowej** — dodaj `--en-nuclear` (oba motywy) w naszych
  tokenach, w duchu palety technologii; odnotuj jako rozszerzenie do przeglądu
  projektanta.
- **Przed nami**: pasmo prognozy popytu (suma miast, `cityDemandForecast` per
  godzina do końca doby) jako jaśniejszy obszar `lo..hi` + kreskowana linia
  środka (wzór designu: wypełnienie @ 0.14).
- Legenda pod wykresem (`.en-chartlegend`): swatche technologii + nota
  `— PRAWDA · ┄ PROGNOZA (PASMO)`.
- Świeża doba (`dayReports` puste): sam obszar prognozy.

### 3. Przewijanie (01 §2.5)

Mechanika w store (pętla `resolve()` na silniku — synchronna, silnik jest
szybki), nastawy w przewijanych turach bez zmian („świadome przyjęcie ryzyka"):

- **„Przewiń do tury"**: komórki przyszłych tur w `TurnBar` stają się klikalne
  → rozstrzyga kolejne tury aż do wskazanej (w obrębie bieżącej doby).
- **`PRZEWIŃ ⏭`** (ghost obok commita, odblokowany z M6): rozstrzyga tury aż
  do zadziałania warunku stopu albo do końca doby. Warunki stopu (sprawdzane
  na raporcie każdej rozstrzygniętej tury; stałe progów w jednym module app
  z komentarzem, do strojenia):
  1. niedobór: `totals.ensMw > 0`,
  2. przeciążenie linii: dowolny segment `usedMw / capacityMw ≥ 0,9`,
  3. odchylenie od prognozy: `|forecastMiss.x.actualMw − forecastMw|` większe
     niż pasmo prognozy dla tej wielkości,
  4. zmiana bilansu: `finance.netPln` gorszy od poprzedniej tury o próg
     (np. > 20 mln — parametr).
- Po zatrzymaniu: pas raportu pokazuje turę zatrzymania, a nad przyciskami
  pojawia się wiersz diagnozy z powodem (np. `⏭ zatrzymano: TURA 5 —
  niedobór 12 MW w TURÓW`) — bezosobowo, ze źródłem liczby.
- Rozstrzygnięcie zwykłe (`ZATWIERDŹ TURĘ ▸`) bez zmian. Semantyka rozjazdu
  commit/skip (pytanie otwarte z README handoffu) zostaje rozstrzygnięta tak:
  commit = jedna tura, skip = wiele tur z warunkami stopu.

### 4. Poza zakresem

Przewijanie wielu dób i „przewiń do zdarzenia w przyszłym miesiącu" (dojdzie,
gdy okaże się potrzebne — 01 §2.5 mówi o rytmie dobowym), animacje, autopilot
nastaw (zakazany — 01 §8).

## Kryteria akceptacji / testy

1. Silnik: test `dayReports` (8 wpisów po pełnej dobie, reset na nowej dobie,
   round-trip serializacji); goldeny przegrane i przejrzane.
2. Builder wykresu: snapshoty dla fixture (pełna doba z magazynem i importem —
   warstwy sumują się do pokrycia; świeża doba — samo pasmo); warstwy zgodne
   z 7-elementową listą z 01 §8 pkt 2.
3. Store: test przewijania — stop na ENS (scenariusz z niedoborem w turze
   szczytu), stop na przeciążeniu, dojście do końca doby bez zdarzeń; nastawy
   niezmienione po przewinięciu.
4. Testy komponentowe: klik przyszłej tury przewija; diagnoza stopu widoczna.
5. e2e: przewiń do SZCZYTU WIECZORNEGO, sprawdź licznik tur i raport.
6. Zasady wspólne z `plan/README.md`.
