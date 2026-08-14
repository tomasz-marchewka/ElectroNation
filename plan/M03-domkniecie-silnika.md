# M3 — Domknięcie silnika: rozbudowa, anulowanie, systemy prognostyczne

**Warstwa:** silnik (`src/engine/`), bez UI. **Zależności:** brak (może iść
równolegle z M2; przy konflikcie schematu stanu skoordynuj bump wersji).
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §2.4, §2.6, §5.4,
§5.7, §7; 02 §8.2–8.4; 06 §8.4 (pkt 5) i §8.6 (cały); `src/engine/build.ts`,
`engine.ts`, `forecast.ts`, `state.ts`, `config.ts`, `regimes.ts`.

## Cel

Silnik pokrywa komplet mechanik wersji uproszczonej, których brakuje po M1/M2:
rozbudowę istniejących obiektów, anulowanie budów, kupowalne systemy prognostyczne
z wielodobowym horyzontem oraz prognozę reżimu miesięcznego. Wszystko jako akcje
JSON na `GameState` (przyszły protokół replay).

## Zakres

### 1. Rozbudowa istniejących obiektów (01 §7, 02 §8.4)

Dziś `queueObject` odrzuca zajęty heks — rozbudowa nie istnieje, a `PUMPED_BLOCK.maxBlocks`
i `STORAGE_TECHS[*].buildDays` to martwa konfiguracja.

Nowe akcje (celują w **id obiektu**, nie heks):

- `expandPlant { plantId, capacityMw }` — dodaje blok. Limit: **6 bloków na heks**
  (śledź liczbę bloków w `PlantState`; blok ≤ `maxBlockMw` technologii). Koszt
  **85% CAPEX-u** nowej lokalizacji × mnożnik terenu; czas **70%** `buildDays`,
  zaokrąglony w górę do pełnych dób, min. 1 (udokumentuj zaokrąglenie komentarzem
  i testem). Nowy blok ma własny licznik budowy (wpis w `constructions` z pending
  „expansion"), po ukończeniu zwiększa `capacityMw` obiektu.
- `expandFarm { farmId, capacityMw }` — do limitu heksa (wiatr 300 / PV 200 MW);
  85% CAPEX-u, 70% czasu (dla farm buildDays=1 → nadal 1 doba).
- `expandBattery { storageId, powerMw, capacityMwh }` — dokupienie modułów mocy
  i/lub pojemności do limitów heksa (500 MW / 2 000 MWh). Ceny modułów **wprost
  z 02 §8.2** (1,6 mln/MW; 1,1 mln/MWh — to już są ceny modułowe, bez rabatu 85%);
  czas: `STORAGE_TECHS.battery.buildDays` (napraw hardkod „1" w `build.ts` przy okazji).
- `expandPumpedStorage { storageId }` — +1 blok 250 MW / 2 500 MWh za ~1,1 mld,
  do **4 bloków** (02 §8.2); czas `STORAGE_TECHS.pumped.buildDays` (napraw hardkod „5").
- `expandJunction { junctionId }` — +250 MW przepustowości i +2 przyłącza liniowe
  za moduł, **do 6 modułów** (1750 MW / 18 przyłączy); moduł ~90 mln zł, 1 doba —
  ceny wprost z 01 §5.4. Uwaga: limit przyłączy stacji musi od teraz być polem
  stanu (bazowe 6 + 2/moduł), a walidacja `buildLine` (`LINE_SLOTS_PER_OBJECT`)
  ma używać limitu per obiekt, nie stałej globalnej.
- `expandBorder { borderId }` — +500 MW zdolności za ~0,7 mld, 2 doby (01 §5.7).

Reguła cen: tam, gdzie dokument podaje cenę modułu wprost (stacja, przyłącze
graniczne, moduły magazynów), użyj jej; reguła 85%/70% z 02 §8.4 stosuje się do
elektrowni i farm. Odnotuj to rozstrzygnięcie komentarzem w konfiguracji — doc 03/04
może je później skorygować.

Walidacje wspólne: obiekt istnieje i jest ukończony, limit lokalizacji nieprzekroczony
(wliczając rozbudowy w toku), stać gracza; inaczej no-op.

### 2. Anulowanie budowy (01 §2.6, §7)

- `cancelConstruction { constructionId }` — usuwa wpis z kolejki; **nakłady przepadają**
  (zero zwrotu). Działa też dla rozbudów.
- `cancelLine { lineId }` — dozwolone tylko dla linii w budowie (`builtHours <
  totalHours`); linia znika, nakłady przepadają. Ukończonych obiektów i linii nie
  rozbiera się (poza zakresem wersji uproszczonej).

### 3. Systemy prognostyczne (01 §2.4, 06 §8.6.3)

- Nowe pole stanu `forecastLevel: "basic" | "advanced" | "ensemble"` (start: basic)
  i akcja `buyForecastSystem { level }` — tylko w górę, płatna z budżetu. Ceny jako
  parametry `CONFIG` (01 §2.4: ~600 mln zaawansowany, ~1,2 mld ansamblowy; doc 03
  doprecyzuje).
- Mnożniki σ per poziom: ×1,0 / ×0,7 / ×0,5 — wpinają się w `sigmaWind/Pv/Demand`
  (funkcje dostają poziom albo cały stan; zaktualizuj wywołania i testy doc06-forecast).
- **Horyzont prognozy**: basic = bieżąca doba (24 h, stan obecny), advanced = **3 doby**,
  ensemble = **7 dób**. To wymaga prawdy przyszłych dób:
  - Architektura per 06 §8.6.1/§8.6.3: prawda może powstawać doba po dobie z tego
    samego ziarna. Zalecenie: przejdź na strumienie PRNG kluczowane indeksem doby
    (np. `seedStream(seed, "weather-day-" + dayIndex)` i analogicznie forecast),
    dzięki czemu prawdę doby N można wygenerować w dowolnym momencie, deterministycznie
    i niezależnie od kolejności. To zmienia przebiegi względem obecnego strumienia
    sekwencyjnego → **przegranie goldenów z przeglądem diffa** i sprawdzenie, że
    projekt `stats` nadal mieści się w pasmach 06 §12 (to jest właściwy test tej
    przebudowy).
  - Uwaga na sprzężenie: prawda popytu doby zależy od stanu miast (wzrost miesięczny),
    a przyszłe doby nie znają przyszłego wzrostu. Rozstrzygnięcie: prognoza dób
    przyszłych liczy się na **bieżącym** stanie miast (błąd z tego tytułu jest
    znikomy w horyzoncie ≤7 dób i niepoliczalny dla gracza) — udokumentuj w kodzie.
  - Rozszerz API prognoz o wymiar doby (np. `cityDemandForecast(state, cityId,
    dayOffset, hour)` z zachowaniem zgodności dla doby bieżącej) oraz o σ rosnące
    między dobami: **+25%/dobę** jako parametr `CONFIG` (06 §8.6.3 daje widełki
    20–30% — wybierz 25%, opisz komentarzem).
  - `projectBalance` zostaje na bieżącej dobie (kolumna „bilans" — 06 §8.6.4);
    panel prognozy wielodobowej w UI skonsumuje nowe API bezpośrednio.

### 4. Prognoza reżimu miesięcznego (06 §8.4 pkt 5)

Gracz ma znać reżim miesiąca z wyprzedzeniem jako prognozę, z trafnością rosnącą
z poziomem systemów prognostycznych:

- Przy inicjalizacji miesiąca generuj (z dedykowanego strumienia forecast)
  **pokazywany** reżim: z prawdopodobieństwem trafności `p(level)` prawdziwy
  dominujący, w przeciwnym razie inny sensowny dla miesiąca (wagi z
  `MONTHLY_REGIME_WEIGHTS` z wyzerowanym prawdziwym). Parametry `p` w `CONFIG`
  (propozycja: 0,6 / 0,8 / 0,95 — do strojenia w doc 03; opisz komentarzem).
- Pole stanu np. `monthRegimeForecast: RegimeId`, eksponowane dla UI.
- **Świadomie poza zakresem**: łańcuch Markowa dzień-po-dniu z 06 §8.3 — mapowanie
  pogody na kalendarz gry definiuje §8.4 (reżim dominujący miesiąca + ~15% zmiana
  w dobie wolnej) i jest już zaimplementowane. Nie implementuj §8.3.

### 5. Raport i determinizm

- Rozbudowy/anulowania wpinają się w istniejące ścieżki (`constructions`,
  spawn na koniec doby). `lastTurnReport` nie wymaga zmian poza tym, że
  rozbudowane obiekty raportują się jak dotąd.
- Wszystkie nowe losowania: nazwane strumienie, stała liczba poborów na krok
  (wyrównanie strumieni — patrz wzorzec w `growth.ts`), kwantyzacja na granicy
  generacji.
- `STATE_SCHEMA_VERSION`: podbij raz na cały kamień.

## Kryteria akceptacji / testy

1. Spec-testy rozbudów (01 §7, 02 §8.4): koszty 85%, czasy 70% (z zaokrągleniem),
   limity (6 bloków, limity heksów OZE/magazynów, 6 modułów stacji z przyłączami,
   moduły graniczne), rozbudowa w toku blokuje przekroczenie limitu, no-opy.
2. Spec-testy anulowania: nakłady przepadają, kolejka czysta, linia znika; anulowanie
   nieistniejącego id = no-op.
3. Spec-testy systemów prognoz (06 §8.6.3): mnożniki σ zwężają pasmo (porównanie
   szerokości pasm per poziom), horyzont 24 h / 3 doby / 7 dób, σ rośnie między
   dobami, prawda doby przyszłej = prawda tej samej doby po jej nadejściu
   (spójność lookahead vs live — kluczowy test).
4. Spec-test prognozy reżimu: deterministyczna dla seeda, trafność ~p(level) na
   dużej próbie (test statystyczny, luźne pasmo).
5. Determinizm i serializacja: istniejące testy przechodzą; fuzz akcji (fast-check)
   rozszerzony o nowe akcje.
6. Goldeny przegrane z przeglądem diffa; `stats` w pasmach 06 §12.
7. Zasady wspólne z `plan/README.md` (lint, typecheck, test, build).
