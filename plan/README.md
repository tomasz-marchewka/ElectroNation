# Plan implementacji v1 — briefy dla wykonawców

Katalog zawiera samodzielne opisy kamieni milowych M2–M10 pierwszej grywalnej wersji
ElectroNation. Każdy plik to kompletny brief do przekazania modelowi/programiście:
kontekst, zakres, wymagania, kryteria akceptacji. Kamień M1 (raport tury w silniku)
jest **zrealizowany** — briefy zakładają jego obecność.

## Kolejność i zależności

```
M2 (mapa v1) ──┐
M3 (silnik)  ──┼── niezależne od siebie, czysty silnik, można równolegle
               │
M4 (fundament UI) ── M5 (mapa SVG) ── M6 (pętla tury) ── M7 (budowanie z UI)
                                                     └── M8 (wykres + przewijanie)
M9 (zapis) — po M6
M10 (stabilizacja) — na końcu
```

Minimalna grywalna pętla istnieje po M6 (na mapie z M2). M7 czyni grę kompletną.

## Zasady wspólne (obowiązują w KAŻDYM kamieniu)

Pełne zasady w `CLAUDE.md` (przeczytaj przed startem). Najważniejsze:

1. **Kod wyłącznie po angielsku** — identyfikatory, komentarze, stringi w źródłach,
   nazwy plików, komunikaty commitów. Polskie są tylko teksty widoczne dla gracza
   (warstwa UI) i dokumenty w `docs/`.
2. **Żadnej atrybucji AI** — nigdzie (kod, komentarze, commity, docs).
3. **Nie commituj bez wyraźnego polecenia użytkownika.**
4. **Dokumenty `docs/` są kanonem** każdej wartości parametru i mechaniki. Gdy kod,
   design system albo ten brief różni się od docs — wygrywają docs; napraw kod i testy
   w tym samym commicie.
5. **Determinizm silnika**: cała losowość przez seedowane PRNG z `src/engine/prng.ts`
   (nazwane strumienie, nigdy `Math.random`); pieniądze w całkowitych PLN; prawda
   kwantyzowana na granicy generacji (`quantize01`/`quantize001`); stan gry to czysty
   JSON (bez klas, Map, Date, funkcji).
6. **Mur silnika**: `src/engine/` nie importuje niczego z `src/app/`, nie używa API
   przeglądarki ani Node — pilnują tego `tsconfig.engine.json` i ESLint. API silnika
   to czyste funkcje (`newGame`, `applyAction`, `resolveTurn`) na serializowalnym
   `GameState`; akcje są obiektami JSON.
7. **Testy**: nowe mechaniki dostają testy specyfikacyjne cytujące sekcje dokumentów
   (np. `§12.1` w nazwie testu). Zmiana zachowania silnika = przegranie goldenów
   (`npm run goldens:update`) i **przejrzenie diffa** — nigdy w ciemno. Nieprzeczytany
   czerwony golden to regresja, nie szum.
8. **Definition of done** dla każdego kamienia: `npm run lint`, `npm run typecheck`,
   `npm test` (wszystkie projekty) i `npm run build` zielone; e2e (`npm run e2e`)
   przechodzi, jeśli kamień dotyka UI.

## Stan wyjściowy (po M1)

Silnik (`src/engine/`) implementuje dokumenty 02/05/06: rozpływ kolejnych najtańszych
ścieżek, pogodę z reżimami, astronomię/PV, wiatr, prognozy z pasmem, model popytu
i wzrostu miast, akcje budowy, magazyny, import/eksport. Z M1 dodatkowo:

- `GameState.lastTurnReport: TurnReport | null` — pełny raport rozstrzygniętej tury:
  per miasto (popyt/dostarczenie/ENS), per źródło (oferowana vs użyta moc), per segment
  linii (przepływ + indeksy trasy `fromIndex`/`toIndex` pod kolorowanie mapy), per
  węzeł (wykorzystanie przepustowości), magazyny (SOC), granice (take-or-pay), zakład
  z prognozą (prognoza vs prawda dla popytu/wiatru/PV) i rozbicie finansowe z `netPln`
  równym dokładnie zmianie budżetu. Typy w `src/engine/state.ts`.
- `projectBalance(state)` w `src/engine/forecast.ts` — kolumna „bilans przy obecnych
  nastawach" (01 §8 pkt 3): pozostałe godziny doby, pasma, bilans oczekiwany
  i najgorszy przypadek. Świadomie ślepa na sieć (bez limitów i strat).
- `STATE_SCHEMA_VERSION = 5`; goldeny rejestrują KPI per tura.

UI (`src/app/`) to nadal placeholder — buduje się od M4.

## Design system (podstawa warstwy UI, kamienie M4–M8)

`design_handoff_electronation_design_system/` — design system + w pełni zaprojektowany
ekran dyspozytora. Przeczytaj jego `README.md` w całości przed każdym kamieniem UI.

- **Rola**: wygląd, layout, zachowania interfejsu i reguły języka (Content & Copy
  Rules) pochodzą z design systemu; **zakres funkcjonalny i wszystkie wartości
  liczbowe z `docs/` i `CONFIG` silnika**. Przykład rozjazdu: mnożniki kosztów biomów
  wpisane w etykiety designu (np. góry ×2,2, morze ×3,0) są NIEAKTUALNE — obowiązuje
  02 §8.1 (góry ×2,5, morze ×3,5). Podobnie matematyka bilansu w buildzie referencyjnym
  (straty = 2,9% planu) to atrapa — w grze liczy ją silnik (`projectBalance`).
- Komponenty `.jsx` są bliskie produkcji (React bez zależności, stylowane tokenami CSS)
  — adaptuj je do `src/app/` (TypeScript, angielskie identyfikatory, realne dane),
  nie osadzaj plików handoffu bezpośrednio.
- Tokeny `design-system/tokens/*.css` są źródłem prawdy każdej wartości wizualnej.
  Dwa motywy (`data-theme="dark"|"light"`, dark domyślny). Zero zaokrągleń, zero cieni,
  **zero animacji** (świadoma decyzja — patrz nagłówek `tokens/motion.css`).
- Dozwolone glify: `✓ ⚠ ✕ ◂ ▸ ⏭ ⬡` — żadnych emoji ani bibliotek ikon; ikony obiektów
  to inline SVG w konwencji `HexMap.jsx`.

## Briefy

| Plik | Kamień | Warstwa |
|---|---|---|
| [M02-mapa-i-teren.md](M02-mapa-i-teren.md) | Mapa v1 24×16 + model terenu | silnik |
| [M03-domkniecie-silnika.md](M03-domkniecie-silnika.md) | Rozbudowa, anulowanie, systemy prognoz | silnik |
| [M04-fundament-aplikacji.md](M04-fundament-aplikacji.md) | Store, design system, szkielet ekranu | UI |
| [M05-mapa-svg.md](M05-mapa-svg.md) | Renderer mapy (scene model → SVG) | UI |
| [M06-petla-tury.md](M06-petla-tury.md) | Panel dyspozytora, nastawy, rozstrzygnięcie | UI |
| [M07-budowanie-z-ui.md](M07-budowanie-z-ui.md) | Panel heksa, katalog, trasowanie linii | UI |
| [M08-wykres-doby-i-przewijanie.md](M08-wykres-doby-i-przewijanie.md) | Wykres doby, przewijanie tur | UI + silnik |
| [M09-zapis-i-wczytywanie.md](M09-zapis-i-wczytywanie.md) | IndexedDB, eksport/import, migracje | UI + silnik |
| [M10-stabilizacja.md](M10-stabilizacja.md) | Goldeny scenariuszowe, e2e, strojenie | całość |
