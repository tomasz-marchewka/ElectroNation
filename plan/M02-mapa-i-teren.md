# M2 — Mapa v1 (24×16) i działający model terenu

**Warstwa:** silnik (`src/engine/`), bez UI. **Zależności:** brak (M1 zrealizowany).
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md` (zasady wspólne), docs
01 §3 (świat gry), 02 §8.1 i §8.6 (teren, mapa v1), 06 §6.1 (klasy wiatru),
`src/engine/scenario.ts`, `src/engine/build.ts`, `src/engine/config.ts`,
`src/engine/state.ts`, `src/engine/weather.ts`.

## Cel

Gra toczy się na jednej, ręcznie zaprojektowanej mapie 24×16 zgodnej z 02 §8.6,
a właściwości heksów (teren, klasa wiatru, nasłonecznienie, granice mapy) realnie
wpływają na budowę i produkcję. Dziś `DEFAULT_SCENARIO` to 3 miasta bez danych
terenu — mnożniki terenowe są w praktyce martwe, mapa nie ma granic, a heksowa
siatka jest nieskończona.

## Zakres

### 1. Granice mapy w stanie gry

- Dodaj do `Scenario` i `GameState` wymiary mapy (np. `map: { cols: 24, rows: 16 }`;
  wybierz reprezentację spójną z axial flat-top z 01 §3.1 i udokumentuj mapowanie
  q,r → prostokąt 24×16).
- Walidacja w `build.ts`: każdy heks budowy (obiekt, każdy heks trasy linii) musi
  leżeć w granicach mapy; poza granicami akcja jest no-opem (konwencja: nieprawidłowa
  akcja = no-op, replay-safe).
- `STATE_SCHEMA_VERSION`: podbij (zapisów w obiegu nie ma, migracje nie są potrzebne).

### 2. Nasłonecznienie per heks (01 §3.2)

- Nowe pole mapy: mnożnik regionalny nasłonecznienia per heks
  (`Record<string, number>`, klucz `hexKey`, brak wpisu = 1,0).
- Farma PV zapamiętuje mnożnik swojego heksa w chwili budowy (analogicznie jak
  `windClass` w `FarmState`) i produkcja PV jest nim skalowana w `weather.ts` /
  `farmPowerMwAtHour`. Prognoza (`farmProductionForecast`) ma to odzwierciedlać
  automatycznie (liczy z prawdy produkcji).
- Test akceptacyjny: przy mnożniku 1,0 wyniki statystyczne PV (projekt `stats`,
  06 §12.7–12.8) pozostają w pasmach; mnożnik 0,8 obniża CF proporcjonalnie.

### 3. Woda i szczytowo-pompowa (01 §3.2, 02 §8.1)

- Obiekty na wodzie (jezioro, morze) są już niemożliwe (`TERRAIN.object === null`)
  — zweryfikuj testem. Linie przez wodę są dozwolone z mnożnikami 02 §8.1
  (jezioro ×2,5, morze ×3,5) — jest w konfiguracji, zweryfikuj testem na trasie.
- **Zmiana warunku szczytowo-pompowej**: dziś bramką jest tylko teren
  góry/wyżyna (komentarz w `build.ts` odsyła do modelu mapy). Docelowo per 01 §3.2:
  **góry lub wyżyna + woda** — zaimplementuj jako: heks górski/wyżynny sąsiadujący
  (6 sąsiadów) z heksem jeziora albo morza. Zaktualizuj komentarz i testy.

### 4. Ręczna mapa v1 (02 §8.6)

Nowy moduł danych (np. `src/engine/mapV1.ts`), eksportujący scenariusz `MAP_V1`:

- rozmiar **24×16**, każdy heks ma przypisany teren (pełne pokrycie, nie sparse);
  rozsądna geografia: spójne pasma gór/wyżyn, las, bagna, jezioro (co najmniej
  jedno przy górach/wyżynie — patrz niżej), morze wzdłuż jednej krawędzi;
- **8–12 miast** (nazwy polskie — dane gracza), zróżnicowane klasy wielkości
  (05 §5: małe/średnie/duże przez liczby gospodarstw i firm); dokładnie **jedno
  małe miasto przyłączone na start**;
- **2–4 punkty graniczne** na krawędziach mapy: nowe pole mapy `borderSites`
  (lista heksów). `buildBorder` przyjmuje odtąd tylko heksy z tej listy (01 §5.7:
  punkty graniczne leżą na krawędziach mapy; przyłącze graniczne buduje się
  w punkcie granicznym). Test: budowa poza `borderSites` = no-op;
- klasy wiatru: co najmniej jedna lokalizacja **dobra** (coastal/baltic przy morzu)
  i jedna **zła**; reszta `open` (06 §6.1);
- co najmniej **jedna legalna lokalizacja szczytowo-pompowa** (góry/wyżyna z wodą
  obok — musi przechodzić bramkę z pkt 3);
- zróżnicowane nasłonecznienie (np. 0,95–1,05) — subtelne, PV różnicuje się głównie
  pogodą;
- **minimalny stan posiadania** (01 §3.4): CCGT ~400 MW + ukończona linia SN +
  przyłączone małe miasto; kapitał startowy 10 mld zł.

`MAP_V1` staje się scenariuszem domyślnym `newGame`. Dotychczasowy minimalny
scenariusz zostaje (np. jako `TEST_SCENARIO` w danych testowych albo nadal
eksportowany z `scenario.ts`) — istniejące testy jednostkowe budują własne
scenariusze i nie mogą się posypać przez zmianę domyślnego.

### 5. Poza zakresem

Generator proceduralny (doc 07), edytor map, wybór scenariusza w UI, rendering.

## Kryteria akceptacji / testy

1. **Test walidujący dane mapy** (spec 02 §8.6): rozmiar, liczba miast 8–12, jedno
   przyłączone, 2–4 punkty graniczne na krawędziach, ≥1 dobra i ≥1 zła klasa wiatru,
   ≥1 legalna lokalizacja szczytowo-pompowej, pełne pokrycie terenem, stan posiadania
   zgodny z 01 §3.4. Ten test trzyma mapę w ryzach przy przyszłych edycjach.
2. Testy granic mapy: obiekt/linia poza mapą = no-op; na krawędzi = OK.
3. Testy szczytowo-pompowej: góry bez wody = no-op, góry + jezioro obok = OK.
4. Test mnożnika nasłonecznienia (pkt 2).
5. Test mnożników wodnych linii (koszt trasy przez jezioro/morze).
6. Golden: nowy scenariusz golden na mapie v1 (kilka dób bez akcji + kilka akcji
   budowy), `npm run goldens:update` dla istniejących i przegląd diffa (zmiana
   domyślnego scenariusza zmieni golden smoke — to zamierzone; opisz w commicie).
7. Cała reszta zasad wspólnych z `plan/README.md` (lint, typecheck, test, build).

## Wskazówki

- Mapa to dane, nie kod: trzymaj definicję czytelnie (np. tablica stringów-wierszy
  z literami terenu + słownik obiektów), żeby dało się ją edytować ręcznie.
- Wartości mnożników i limitów NIE kopiuj z design systemu ani z tego briefu —
  źródłem jest `CONFIG`/`TERRAIN` w `src/engine/config.ts`, który mirroruje docs;
  przy rozbieżności wygrywają docs (02 §8.1).
- Uważaj na determinizm: dane mapy są statyczne, bez losowości przy inicjalizacji.
