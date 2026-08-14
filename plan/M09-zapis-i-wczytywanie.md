# M9 — Zapis i wczytywanie gry

**Warstwa:** UI + cienka warstwa silnika (migracje). **Zależności:** M6 (istnieje
grywalna pętla, którą warto zapisywać). **Przeczytaj najpierw:** `CLAUDE.md`,
`plan/README.md`, `src/engine/state.ts` (komentarz o serializowalności,
`STATE_SCHEMA_VERSION`), `tests/unit/serialization.test.ts`, store z M4.

## Cel

Stan gry przeżywa zamknięcie karty: autozapis w IndexedDB, ręczny eksport/import
JSON, wersjonowanie schematu z realnym mechanizmem migracji. Zapis = serializowany
`GameState` — nic więcej (raport ostatniej tury już w nim jest, patrz M1).

## Zakres

### 1. Warstwa zapisu (app, nie silnik)

- Dodaj zależność `idb-keyval` (decyzja w `CLAUDE.md`). Moduł `src/app/save/`
  (albo analogiczny): `saveGame(state)`, `loadGame()`, `clearSave()`.
- **Autozapis** po każdym rozstrzygnięciu tury (hook w store po `resolveTurn`)
  — jeden slot autozapisu. Zapis asynchroniczny, nie blokuje UI.
- Przy starcie aplikacji: jeśli istnieje autozapis → wczytaj i kontynuuj; przycisk
  „NOWA GRA" (z potwierdzeniem — nadpisuje autozapis) w pasku górnym lub prostym
  menu startowym. Bez wielu slotów w v1.
- **Eksport/import JSON**: eksport pobiera plik (`electronation-save-<data>.json`),
  import przez wybór pliku; po imporcie walidacja + migracja jak przy autozapisie.
  Teksty UI po polsku, zgodnie z regułami copy design systemu.

### 2. Wersjonowanie i migracje (silnik)

- Moduł `src/engine/migrations.ts`: rejestr `migrations: Record<number, (state:
  unknown) => unknown>` — funkcja migruje ze schematu N do N+1. `migrateState(raw)`:
  waliduje, że `raw.schema` to liczba ≤ `STATE_SCHEMA_VERSION`, aplikuje po kolei,
  zwraca `GameState` albo błąd domenowy (nie wyjątek z trzewi silnika).
- Od tego kamienia **każdy** bump `STATE_SCHEMA_VERSION` musi dodać wpis migracji
  (dopisz tę zasadę do komentarza przy stałej). Historycznych migracji <aktualna
  wersja nie piszemy — stare zapisy nie istnieją; rejestr startuje pusty, ale
  mechanizm musi działać (test na sztucznej migracji).
- Walidacja wejścia importu: odrzuć z czytelnym komunikatem (po polsku w UI),
  gdy JSON nie wygląda na zapis (brak `schema`/`seed`) albo wersja > aktualnej.

### 3. Poza zakresem

Wiele slotów, zapis w chmurze, kompresja, ochrona przed edycją zapisu (gra
single-player, sandbox — edycja zapisu to sprawa gracza).

## Kryteria akceptacji / testy

1. Unit (silnik): `migrateState` — tożsamość dla aktualnej wersji; ścieżka
   migracji na sztucznym przykładzie (fixture v(N−1) → N); odrzucenie wersji
   z przyszłości i śmieciowego JSON-a.
2. Unit (app, jsdom + fake idb albo pamięciowy adapter): save → load → identyczny
   stan (`toStrictEqual`) i identyczna dalsza ewolucja (hash po kilku turach —
   wzorzec z `serialization.test.ts`).
3. e2e (Playwright): rozegraj turę → przeładuj stronę → stan (budżet, kalendarz,
   raport ostatniej tury) zachowany; eksport pliku działa (sprawdź download).
4. Determinizm: wczytany zapis kontynuuje identycznie jak sesja bez przerwy
   (ten sam hash stanu po N turach) — test jednostkowy.
5. Zasady wspólne z `plan/README.md` (lint, typecheck, test, build, e2e).
