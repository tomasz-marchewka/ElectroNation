# M4 — Fundament aplikacji: store, design system, szkielet ekranu

**Warstwa:** UI (`src/app/`). **Zależności:** M1 (raport tury — jest). Mapa v1 (M2)
niekonieczna — szkielet działa też na scenariuszu domyślnym.
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §2.3 i §8;
`design_handoff_electronation_design_system/README.md` (cały),
`design-system/readme.md` (polski rulebook — reguły copy i fundamenty wizualne),
`design-system/tokens/*.css`, `design-system/css/*.css`, komponenty
`design-system/components/shell/*` i `controls/Button.*` (każdy ma `.d.ts`
z kontraktem i `.prompt.md` z zasadami użycia), `src/engine/index.ts`.

## Cel

Aplikacja ma stały szkielet ekranu dyspozytora (rama z designu: pasek górny → mapa
+ dokowany panel 400 px → pasek 8 tur → pas wykresu → pas raportu), design system
przeniesiony do `src/app/`, most stanu Zustand i dwa motywy. Regiony mapy, panelu,
wykresu i raportu mogą być placeholderami — wypełniają je M5–M8.

## Zakres

### 1. Przeniesienie design systemu

- Skopiuj `tokens/*.css` i `css/base.css` + `css/components.css` do `src/app/styles/`
  (zastępując obecny `app.css`). Tokeny są źródłem prawdy wartości wizualnych —
  nie zmieniaj wartości, usuń tylko martwe `--en-flow`/`--en-flow-opacity`
  (pozostałość po wyciętej animacji; patrz nagłówek `tokens/motion.css`).
- **Fonty**: `tokens/fonts.css` importuje IBM Plex z CDN Google — dla builda gry
  self-hostuj woff2 (IBM Plex Mono 400/500/600 + IBM Plex Sans 400/500/600)
  w `public/fonts/` i podmień `@font-face` (wytyczna `design-system/assets/README.md`).
- **Motywy**: `data-theme="dark"|"light"` na `<html>`, dark domyślny; przełącznik
  CIEMNY/JASNY (wg buildu referencyjnego) umieść dyskretnie (np. w pasku górnym).
  Preferencja zapamiętana w `localStorage` (to warstwa app — mur silnika nie dotyczy).

### 2. Most stanu — Zustand

- Dodaj zależność `zustand` (decyzja w `CLAUDE.md`; ESLint już zabrania jej
  w silniku). Store w `src/app/store/`:
  - `game: GameState` (start: `newGame(seed)` — seed na razie stały lub z URL),
  - `dispatch(action: Action)` → `applyAction`, `resolve()` → `resolveTurn`
    (czyste wywołania silnika, stan podmieniany immutably),
  - `selectedHex: HexCoord | null` (na M5/M7), `theme`,
  - selektory pochodne (np. kontekst kalendarza, agregaty prognoz) jako czyste
    funkcje w osobnym module z testami.
- Zero logiki domenowej w komponentach — wszystko przez silnik albo selektory.

### 3. Adaptacja komponentów powłoki

Przepisz do `src/app/components/` jako TypeScript (`.tsx`), z typami z `.d.ts`
handoffu, angielskie identyfikatory, polskie stringi UI: `TopBar`, `Panel`,
`PanelSection`, `TurnBar` (+ stała `DAY_TURNS` — mapuje się 1:1 na `TURN_PHASES`
silnika: night→NOC … lateEvening→PÓŹNY WIECZ.), `Button`, `StatusDot`.
Zasady z `.prompt.md`: pasek górny bez akcji; panel nigdy nie jest chowany ani
tabowany; max 4 sekcje panelu; dokładnie jeden przycisk primary na ekranie;
`TurnBar` nigdy nie pokazuje 24 godzin.

### 4. Szkielet ekranu

- Rama `.en-app` zgodnie z layoutem z `README.md` handoffu (52 px topbar; body:
  mapa `flex:1 min-width:0` + panel 400 px; pasek tur; pas wykresu; pas raportu
  pełnej szerokości renderowany tylko, gdy jest `lastTurnReport`).
  Desktop-first (referencja 1500×~900); mapa flexuje, panel jest sztywny.
- **Pasek górny z realnych danych**: wordmark `⬡ ELECTRONATION`; kontekst
  `ROK n · <MIESIĄC> · DOBA ROBOCZA A/B | WOLNA · REŻIM: <nazwa>` z `calendar`,
  `monthForGameDay`, `dayTypeForGameDay`, `monthRegimes.dominant` (po M3 podmień
  na `monthRegimeForecast` — prognozę zamiast prawdy; zostaw TODO-komentarz
  z odsyłaczem); KPI: `BUDŻET` (formatowanie mld/mln zł), `PROGNOZY PODSTAWOWY · 24 H`
  (statyczne do M3). KPI „WYNIK DOBY" wymaga historii tur doby — dochodzi w M8,
  nie atrapuj go.
- **Formatery liczb** — wspólny moduł `src/app/format.ts` + testy: przecinek
  dziesiętny, spacja tysięcy, `mld/mln zł` bez groszy, nastawy `wartość / max`,
  pasma `±`, jednostki zawsze (reguły Content & Copy z README handoffu).
  Dozwolone glify wyłącznie `✓ ⚠ ✕ ◂ ▸ ⏭ ⬡`, zero emoji.
- Regiony mapy/panelu/wykresu: placeholder z tokenowym tłem (bez treści atrapowej,
  która wyglądałaby jak dane).

### 5. Testy i sprzątanie

- Zaktualizuj `tests/components/app.test.tsx` (obecny sprawdza nagłówek i „16 h
  44 min" — do wymiany na: rama się renderuje, topbar pokazuje budżet ze stanu,
  przełącznik motywu przestawia `data-theme`).
- Testy komponentowe adaptowanych komponentów (render + interakcje przez Testing
  Library; snapshotuj struktury danych, nie piksele).
- e2e smoke: podmień oczekiwania na nowy ekran (wordmark widoczny, brak błędów
  konsoli).

## Kryteria akceptacji

1. Aplikacja startuje z ramą ekranu w obu motywach; layout zgodny z handoffem
   (wymiary z tokenów, nie z tego briefu).
2. Store wykonuje `resolveTurn` (tymczasowy przycisk w panelu może być, primary,
   podpisany `ZATWIERDŹ TURĘ ▸` — M6 go zagospodaruje) i topbar aktualizuje budżet.
3. Zero importów z `src/app` w silniku (lint pilnuje); zero wartości wizualnych
   poza tokenami; zero animacji.
4. Formatery przetestowane; komponenty przetestowane; e2e zielone.
5. Zasady wspólne z `plan/README.md` (lint, typecheck, test, build, e2e).
