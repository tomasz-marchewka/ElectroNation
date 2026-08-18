# M11 — Wstęga czasu: podgląd tur wstecz i horyzont kroczący

**Warstwa:** silnik + UI. **Zależności:** M8 (wykres doby, przewijanie), M9 (migracje).
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §2.3, §2.4, §2.5,
§8 pkt 1–2 i 5; 02 §4.1 i §9.12; 06 §8.6.3; `src/engine/state.ts`, `src/engine/engine.ts`
(`resolveTurn`), `src/engine/forecast.ts`, `src/engine/migrations.ts`,
`src/app/chart/dayChart.ts`, `src/app/components/TurnBar.tsx`,
`src/app/components/ReportStrip.tsx`, `src/app/panel/report.ts`,
`src/app/store/gameStore.ts`, `src/app/store/skip.ts`.

## Cel

Oś tur i wykres doby stają się **jedną wstęgą czasu** przewijaną lewo-prawo: wstecz do
pierwszej rozegranej tury, w przód do granicy horyzontu prognozy. Klik w turę pokazuje
jej raport (wstecz) albo prognozę (w przód) i **nigdy nie rusza czasu**. Horyzont prognozy
staje się kroczący (24 h / 3 doby / 7 dób od tury bieżącej).

## Zakres

### 1. Silnik: horyzont kroczący (06 §8.6.3, 01 §2.4)

Granica zasięgu przenosi się z „numeru doby" na godziny: godzina docelowa jest w zasięgu,
gdy `1 ≤ h ≤ 24·D`, `h = 24·Δdoba + godzina − tura_bieżąca·3 + 1`, `D` = horyzont poziomu
w dobach.

- `dayTruthAtOffset` przepuszcza `Δdoba ≤ D` (dziś: `< D`) — poziom podstawowy zagląda do
  doby następnej we wszystkich turach poza pierwszą. Prawda doby przyszłej powstaje
  z jej własnych strumieni; ta sama doba wygenerowana dwa razy musi być identyczna co do
  bitu (06 §8.6.1).
- Odcięcie po godzinach dotyczy `cityDemandForecast`, `farmProductionForecast`
  i `dayForecast`; poza zasięgiem — brak punktu, nigdy wartość bez pasma.
- Przyrost σ między dobami zostaje kluczowany `Δdoba` (skok na granicy doby) — 06 §8.6.3.
- Testy `doc06-forecast*` przegrane razem z dokumentem; nowy test granicy: prognoza obejmuje
  zawsze `8·D` tur niezależnie od pory doby — w turze 1 zasięg pokrywa się z bieżącą dobą,
  w turze 6 sięga 15 h w dobę następną, w turze 8 — 21 h.

### 2. Silnik: archiwum skrótów tur (02 §4.1)

- `TurnDigest` + `GameState.history: TurnDigest[]`; `resolveTurn` dopisuje skrót na koniec
  (krok 9 z 02 §4). Zawartość dokładnie wg tabeli 02 §4.1 — bez segmentów, bez węzłów,
  bez mocy oferowanej.
- **Rozbicie pokrycia na 7 warstw technologii przenosi się z `app/chart/dayChart.ts` do
  silnika** i liczy się w chwili rozstrzygnięcia (02 §4.1 pkt 1). `dayChart` przestaje
  mapować `sources[] → technologia` z bieżącego stanu.
- `lastTurnReport` i `dayReports` zostają bez zmian — pełny raport nadal zasila mapę,
  panel heksa i warunki stopu przewijania.
- `STATE_SCHEMA_VERSION` 10 → 11 + migracja: archiwum starego zapisu powstaje z jego
  `dayReports` (jedyna historia, jaką taki zapis ma); starszych tur nigdy nie było.
- Goldeny przegrane z **przeglądem diffa**; `perf-year` pilnuje, że koszt tury nie rośnie
  z długością archiwum.

### 3. UI: wstęga czasu (01 §8 pkt 2)

`src/app/timeline/` — czysty builder modelu (GameState + zakres tur → geometria) i komponent
SVG, tym samym kontraktem co scene model mapy.

- Wspólna oś X w jednostce tury; **jednostką jest tura, nigdy godzina** (handoff:
  „nigdy nie pokazuj 24 godzin"), separatory dób z podpisem (miesiąc, typ doby).
- **Wirtualizacja**: builder dostaje zakres `[od, do]` i buduje geometrię wyłącznie dla
  okna widocznego ±margines. Dostęp do skrótu po indeksie (`doba × 8 + tura`), O(1).
- Skala pionowa liczona z **widocznego okna**, kwantowana co 100 MW jak dziś — inaczej
  wczesne doby spłaszczą się do zera przy sieci 20 GW.
- Za nami: warstwy pokrycia + linia popytu (prawda) + **pasmo prognozy popytu sprzed
  rozstrzygnięcia** (`forecastMiss.demand` ze skrótu). Przed nami: prognoza popytu z pasmem
  do granicy horyzontu; za granicą wstęga się kończy.
- Sterowanie: przeciąganie, kółko, klawiatura; powrót do TERAZ jednym kliknięciem.

### 4. UI: wybór tury i pasek raportu (01 §2.3, §2.5, §8 pkt 5)

- `selectedTurn` w store (stan widoku, **nie** w `GameState`): kasowany przy każdym ruchu
  czasu, przy wczytaniu zapisu i przy nowej grze.
- Pasek raportu czyta **zawsze skrót** — także dla tury bieżącej. Jedna ścieżka kodu
  gwarantuje, że podgląd wstecz jest tożsamy z tym, co gracz widział na żywo.
- Tura przyszła: pasek pokazuje **kartę prognozy** (popyt, wiatr, PV jako pasma) z etykietą
  odróżniającą prognozę od wyniku. Panel dyspozytora zostaje przy turze bieżącej — wstęga
  jest powierzchnią przeglądu, nie drugim panelem decyzji.
- **Klik nie rusza czasu.** Przewijanie zostaje przy swoim przycisku obok `ZATWIERDŹ
  TURĘ ▸`: bez wyboru w przód to `PRZEWIŃ ⏭` (do zdarzenia), z turą przyszłą wybraną na
  wstędze — `PRZEWIŃ DO T6 ⏭` (do niej). Pasek raportu nie niesie akcji.
  `TurnBar.onSelect` w dzisiejszym znaczeniu (klik = `scrubToTurn`) znika.

## Poza zakresem

Ekran statystyk (miesiąc, rok), wykresy pieniędzy i majątku w czasie, cofanie mapy razem
ze wstęgą (01 §8 pkt 1 mówi „nie"), przewijanie w przód poza horyzont, zgrubianie archiwum
starszego niż rok (02 §10 pkt 4 — dopiero gdy rozmiar zapisu zaboli), animacje.

## Kryteria akceptacji / testy

1. Silnik, horyzont: testy granicy z pkt 1; prawda doby `Δdoba = D` dostępna i deterministyczna;
   pasmo rośnie skokiem na granicy doby.
2. Silnik, archiwum: 02 §9.12 (ciągłość, zgodność z paskiem na żywo, suma `net` doby, suma
   warstw = dostarczenie + straty, round-trip zapisu); migracja zapisu ze schematu 10.
3. Builder wstęgi: snapshoty modelu dla okna w środku historii, okna na granicy doby i okna
   sięgającego poza horyzont; test, że model nie zawiera geometrii spoza okna.
4. Store: wybór tury nie zmienia `GameState`; każdy ruch czasu sprowadza wybór na teraz.
5. Komponenty: klik w turę wstecz zmienia pasek raportu i **nie** zmienia kalendarza; klik
   w turę przyszłą pokazuje kartę prognozy i przestawia przycisk przewijania na `PRZEWIŃ DO
   T…`; ten przycisk rozstrzyga tury aż do wskazanej.
6. e2e: rozegrać 2 doby, przewinąć wstęgę wstecz, kliknąć turę z pierwszej doby, sprawdzić
   nazwę tury na pasku i powrót do TERAZ.
7. Zasady wspólne z `plan/README.md`.
