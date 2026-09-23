# Handoff: świat 3D (gałąź `feat/three-d`) — stan na 2026-09-18

Dokument przekazania pracy nad frontem 3D (Three.js) ElectroNation. Mówi, co jest
zrobione, co zostało do zrobienia i czego nie udało się osiągnąć. Zadanie **nie jest
ukończone** — praca stanęła w połowie fali 2a na limicie użycia sesji.

Źródła prawdy, do których ten dokument odsyła: `ARCHITECTURE.md` (EN, architektura
i kontrakty), `docs/08-interfejs-3d.md` (PL, kanon projektowy), `docs/STATUS.json`
(stan modułów, rundy, otwarte problemy), pliki `PROGRESS.md` w folderach modułów
(przekazanie między krokami budowniczych).

## 1. Skrót

- **Fundament stoi i jest zielony.** Most `GameState → WorldScene`, rdzeń renderera,
  harness przechwytywania, powłoka HUD, fallback SVG, podział Playwright. `npm run check`
  przechodzi (635 testów), e2e 19/19, silnik i goldeny bajt w bajt jak na `main`.
- **Zbudowane warstwy świata:** teren, niebo/pogoda, sieć (linie NN/SN/WN), elektrownie,
  OZE (wiatr on/offshore, PV), miasta. **Atrapy (stuby):** magazyny, węzły (stacje,
  granice, place budowy), efekty. **Nie zaczęte:** dopracowana interakcja, pass
  wydajnościowy, audio, kuracja stanu pokazowego, bramki końcowe.
- **Żaden moduł nie zaliczył krytyków.** Jedyna odbyta runda krytyków to HUD r1:
  art 6,5 / czytelność 6,5 (próg 8,5). Pozostałe moduły mają tylko samooceny
  budowniczych (art 5–6,5; czytelność 7–8).
- **Poziom wizualny jest daleko od celu „fotorealizm AAA".** Widok strategiczny to dziś
  czytelny schemat na proceduralnym terenie, nie świat klasy Cities: Skylines II
  (szczegóły w §4).
- **Nic nie jest zacommitowane.** Cała praca (89 plików, ~20 tys. linii w `src/world/`
  plus zmiany w `src/app/`, skryptach, konfiguracji) leży w drzewie roboczym. Commit jest
  decyzją użytkownika (CLAUDE.md: nigdy bez wyraźnej prośby).

## 2. Co zostało zrobione

### 2.1 Fundament (integrator) — gotowe, przetestowane

| Obszar | Pliki | Stan |
| --- | --- | --- |
| Dokumenty | `ARCHITECTURE.md`, `docs/08-interfejs-3d.md`, `docs/STATUS.json` | kompletne, aktualizowane |
| Most (jedyny szew silnik → świat) | `src/world/bridge/*` (`worldScene.ts` kontrakt, `buildWorldScene.ts`, `sun.ts`, `weather.ts`, `flowDirection.ts`, `labels.ts`, `showcase.ts`, `hud.ts`) | gotowe, 33 testy + snapshot w `tests/unit/world/` |
| Rdzeń renderera | `src/world/render/core/*` (rejestr modułów z izolacją awarii, `CameraRig` z presetami `strategic/overview/north/closeup/golden/detail`, `PostFx`, `Quality`, `FrameClock`, PRNG sfc32, `exaggeration.ts`, `units.ts`, `textures.ts`, `BoardOutline`) | gotowe |
| Harness | `scripts/capture.mjs`, `src/world/capture/*`, `src/world/showcase/registry.ts`, `window.__en` | gotowe: PNG + JSON (błędy, fps z rAF, GPU ms z timer queries, `renderer.info`, szacunek pamięci, werdykt budżetu), `--showcase --all`, `--modules`, `--headed`, wykrywanie obcego serwera i porty zapasowe |
| Ściana ESLint („world wall") | `eslint.config.js` | moduły renderujące nie importują silnika/aplikacji/budowniczych mostu; zakaz `Math.random`/`Date` |
| Aplikacja | `src/app/App.tsx`, `gameStore.ts` (`replaceGame`, `persist`), `src/app/dispatch.ts` (`plantOrderMw`), `src/world/WorldView.tsx` | wybór renderera 3D/SVG, tryb capture/showcase, `?hud=0`, `?theme=`, `?modules=` |
| Testy e2e | `playwright.config.ts` (projekt `chromium` = `world.spec.ts` na 5273, `chromium-svg` = nietknięty `smoke.spec.ts` na 5274) | 19/19 |
| Determinizm | PRNG renderera z `GameState.seed`, zegar przypięty `?clock=` | zrzuty bajt w bajt (md5) potwierdzone wielokrotnie |
| Stan pokazowy | scenariusz `midgame` (ziarno 20260902), klatka sądzenia = doba 1, tura 6 (SZCZYT WIECZORNY, styczeń) | gotowy; pokazy modułów domyślnie na dobie 1 |

Zależności: `three@0.184.0`, `@types/three@0.184.1` (zainstalowane z cache offline —
rejestr npm był nieosiągalny; wpisy w `package-lock.json` mają oryginalne `resolved`
i `integrity`).

### 2.2 Moduły budowane przez agentów

| Moduł | Folder | Stan | Samoocena art / czyt. | Krytycy |
| --- | --- | --- | --- | --- |
| terrain | `src/world/render/terrain` | kroki 1–2 zrobione; krok „finish" nie odbył się | 5 / 7 | brak rundy |
| sky | `src/world/render/sky` | kroki 1–2 zrobione; „finish" przerwany (są zrzuty `captures/sky/s3`, brak raportu) | 6 / 8 | brak rundy |
| hud | `src/world/hud` | kroki 1–2 zrobione; runda poprawek 2 przerwana (`captures/hud/fix2`, brak raportu) | — | r1: **6,5 / 6,5 — nie zaliczone** |
| grid | `src/world/render/grid` | krok 1 zrobiony; **krok 2 przerwany w połowie** (patrz §4.4) | 6,5 / 8 | brak rundy |
| cities | `src/world/render/cities` | krok 1 zrobiony; **krok 2 przerwany w połowie**, nowy `lightmap.ts` niezweryfikowany | 6,5 / 8 | brak rundy |
| plants | `src/world/render/plants` | krok 1 zrobiony; krok 2 nie zaczęty | 6,5 / 7 | brak rundy |
| res | `src/world/render/res` | krok 1 zrobiony (2026-09-11); krok 2 nie zaczęty | 6 / 7,5 | brak rundy |
| storage | `src/world/render/storage` | **stub** | — | — |
| nodes | `src/world/render/nodes` | **stub** (stacje, granice, place budowy) | — | — |
| effects | `src/world/render/effects` | **stub** (pierścienie, cząstki przepływu, dźwigi, wstęga trasy, obrys zaznaczenia) | — | — |
| interaction | `src/world/interaction/attach.ts` | baza integratora: klik = wybór heksa, hover, pan/zoom/orbit, klawisze 1/2/3/F | — | — |
| perf | `src/world/perf/*` | tylko pomiar (fps, GPU timer, budżet); pass optymalizacyjny nie zaczęty | — | — |
| audio | `src/world/audio/` | pusty katalog | — | — |

Haki dla efektów są opublikowane i spisane w `docs/STATUS.json → effectsHooks`
(grid: `userData.gridPolylines` / `gridSegments`, `grid:construction-head:<id>`,
`grid:upgrade-head:<id>`; cities: `cities:base:<id>`; plants: `plants:base:<id>`,
`plants:block:<id>:<i>`; res: `res:base:<id>`). Nikt ich jeszcze nie konsumuje.

### 2.3 Ostatnia sesja integratora (2026-09-11 i 2026-09-18)

- Zastosowane prośby o zmiany z kroków 1: `HEIGHT_KM.landmark`, `ShowcaseSpec.day`
  (doba sądzenia 1), klatki `ccgt-evening`, `coal-detail-evening`, `metro-detail-night`,
  `site-progress`, `junction-night`, preset kamery `detail`, `?modules=` / `--modules`,
  `Rng` jako czwarty argument callbacków tekstur.
- Etykieta elektrowni pokazuje rozkaz rzeczywisty: w trybie ręcznym sumę nastaw bloków
  (`src/app/dispatch.ts`, użyte w panelu, mapie SVG i moście). Fikstura
  `tests/unit/app/map-scene.test.ts` dostała `automation: true`, żeby jej oczekiwane
  `800/900` pozostało zgodne z semantyką silnika — oczekiwania testu bez zmian.
- Harness rozpoznaje obcy serwer na porcie (po `<title>ElectroNation</title>`)
  i przechodzi na 5174/5183/5193.
- 2026-09-18: sformatowane Prettierem dwa pliki po przerwanym agencie
  (`cities/layout.ts`, `cities/lightmap.ts`) — wyłącznie formatowanie, żeby
  `npm run check` był zielony przy przekazaniu.
- Przygotowane skrypty kolejnych fal (nieuruchomione): `world-steps-2b.js`
  (storage, nodes, interaction) i `world-steps-3.js` (effects, perf, audio, showcase).

## 3. Stan bramek na 2026-09-18 (zmierzone dziś)

| Bramka | Wynik |
| --- | --- |
| `npm run check` (lint, format, typecheck app + engine, wszystkie testy, build) | **zielone** — 49 plików, 635 testów |
| Goldeny | 10/10, nieprzerejestrowane; `git diff main -- src/engine tests/goldens` puste |
| e2e (`npm run e2e`) | **19/19** |
| Zrzut gry (headless, doba 1 tura 6, HUD) | 0 błędów konsoli/strony, 10/10 modułów `ready` (w tym 3 stuby), budżet ok |
| GPU, headed, M3 Pro, 1600×900, high, wieczór | **6,94 ms > 6,7 ms** (≈ 58 fps na GPU średniej klasy) — **nie spełnione** |
| GPU, headed, południe summerHigh | 6,07 ms (≈ 66 fps) — mieści się |
| Draw calls / trójkąty / pamięć GPU | 67–69 / 373–643 tys. / ~14 MB — duży zapas (limity 800 / 3 mln / 400 MB) |
| Pierwsza interakcja (headed, serwer dev) | **5,5–6,7 s > 4 s — nie spełnione** (build produkcyjny niezmierzony) |
| Transfer | build: JS 202 kB + three 177 kB gzip, CSS 8 kB, fonty ~206 kB — limit 40 MB spełniony z ogromnym zapasem |

Dowody: `captures/integrator/handoff-evening-hud.*`, `handoff-evening-headed.*`,
`handoff-noon-headed.*`, `check-2026-09-18.log`, `e2e-2026-09-18.log`.

Uwaga do liczb GPU: brakuje jeszcze trzech modułów (storage, nodes, effects) i pełnych
kroków 2, więc koszt wzrośnie. Teren + niebo same biorą większość budżetu
(otwarty problem `perf-gpu-terrain-sky`).

## 4. Czego nie udało się osiągnąć

### 4.1 Proces: pętla krytyków praktycznie nie ruszyła

Brief wymagał dwóch krytyków na moduł, do 4 rund, zaliczenie przy obu ocenach ≥ 8,5.
Odbyła się **jedna** runda (HUD) i była niezaliczona. Przyczyna: limit użycia sesji
ubijał agentów w trakcie kroków — sześć przerwanych przebiegów
(2026-09-02 … 09-11). Przy 7 agentach równolegle limit padał w ~15 minut; przy
2 agentach — po 1–2 krokach. W ostatnim przebiegu ukończyły się 4 kroki z 6
(ok. 1 mln tokenów subagentów), potem limit.

### 4.2 Jakość obrazu — uczciwa ocena integratora

Na podstawie dzisiejszych zrzutów strategicznych (nie jest to ocena krytyka, ale nie
wolno jej zawyżać): **art ok. 4–5 / 10, czytelność sieci ok. 7 / 10.**

- Teren z dystansu strategicznego to powtarzalna tekstura szumu; lasy i jeziora mają
  **kształt heksów** (ciemne sześciokąty), brak przejść między biomami; relief widać
  tylko w górach na południu. W nocy plansza jest jednolicie granatowa.
- Miasta, elektrownie i farmy są z widoku strategicznego małymi plamkami; stan bloku
  elektrowni i klasa miasta czytają się dopiero w zbliżeniu (`closeup`/`detail`).
  Zbliżenia są wyraźnie lepsze (np. `captures/integrator/modules-with-plants.png`:
  blok pracujący vs rozruch, dym z jednego komina, światła przeszkodowe).
- Noc „oświetlona dostarczoną mocą" jest słaba: miasta to blade skupiska, brak
  dramaturgii. W bieżącym drzewie wygląd miast pochodzi z **niezweryfikowanego**
  pół-kroku 2 (`lightmap.ts`): porównaj `captures/integrator/handoff-evening-headed.png`
  z `captures/cities/s1/g-game-evening-bare.png` — budowniczy kroku 2 musi to osądzić.
- Za dnia nad morzem i lądem widać biały „śnieg" punktów (gwiazdy lub opad rysowane
  w dzień) — zgłoszone do sky, nienaprawione. Mgła spiera kolor dalekiej połowy planszy.
- Kolor obciążenia linii działa (biały ok / bursztyn ≥ 75 % / czerwień ≥ 99,5 %,
  stabilny pod ACES dzięki własnej poświacie siatki), przeciążona NN do Kamionki
  i etykiety alertów są czytelne.

### 4.3 Brakujące elementy zakresu

- **Magazyny (BESS, szczytowo-pompowa z poziomem zbiornika = SOC), stacje rozdzielcze,
  przyłącza graniczne, place budowy** — nie istnieją w 3D (są tylko etykiety HUD).
- **Efekty**: pierścień wąskiego gardła i blackoutu, kierunek przepływu (cząstki),
  dźwigi, wstęga trasowania, obrys zaznaczonego heksu i hover w terenie, pierścienie
  ograniczeń OZE — brak. Trasowanie linii w 3D działa logicznie (kliknięcia, etykieta
  kosztu w HUD), ale świat nie rysuje ani wstęgi trasy, ani zaznaczenia (sprawdzone
  w kodzie: `render/core` nie czyta `overlay.selection/hover/route`).
- **Interakcja**: brak kolizji kamery z terenem, inercji, granic planszy, pickingu po
  reliefie (dziś płaszczyzna), dotyku.
- **Wydajność**: progi jakości `high/medium/low` istnieją nominalnie, bez realnych
  pokręteł; bloom nie przepuszcza czerwieni (`bloom-hue`); pierwsza interakcja > 4 s.
- **Audio**: nic. **Kuracja pokazu**: tylko rejestr klatek, bez audytu stanów.
- **HUD**: blokery z rundy 1 (alert przeciążenia poza ekranem gubiony w zbliżeniu,
  3 z 29 etykiet odrzucane bez linii prowadzącej, świat ma ~28–35 % widoku 1600×900,
  pasek pogody + diagnostyka zajmują róg NW) — runda poprawek przerwana, stan
  niepotwierdzony. Nie sprawdzono systematycznie, czy **każdy** istniejący panel
  przeżył w układzie 3D, ani czytelności na śniegu w południe w obu motywach.
- **Bramki końcowe**: parytet mechaniczny (formalnie), krytyk całej gry, ślepi
  sędziowie A/B (vs Cities: Skylines II, vs SVG) — nie rozpoczęte.
- **Zablokowane po stronie silnika**: `segment-flow-direction` — kierunek przepływu
  w segmencie jest heurystyką BFS w moście (`flowDirection.ts`), bo `TurnReport` go
  nie niesie. Nie poszerzano `GameState`.

### 4.4 Przerwane w połowie — uwaga przy wznowieniu

- **grid, krok 2**: w `PROGRESS.md` sekcja „Step 2 — in progress". Zrobione
  i sprawdzone testem roboczym: naprawa krzyżowania torów w korytarzach (znak
  przesunięcia liczony na cały wspólny odcinek, nie na krok). W toku, **nieosądzone
  w zrzutach**: strojenie poświaty, matowy przewód daleki, szerokość linii wg typu
  (`enWidth`), ciemniejsza stal. Zrzuty częściowe: `captures/grid/s2/`.
- **cities, krok 2**: „IN PROGRESS — nothing verified yet". Nowy plik `lightmap.ts`
  (mapa świateł miasta na widok strategiczny) wpięty w `index.ts`; drzewo kompiluje się
  i renderuje bez błędów, ale efekt nie był oceniany. Zrzuty: `captures/cities/s2/`.
- **sky finish, hud fix 2**: są zrzuty (`captures/sky/s3`, `captures/hud/fix2`), nie ma
  raportów ani aktualizacji `PROGRESS.md` — traktować jak niezrobione.

## 5. Co trzeba zrobić — kolejność

### A. Przed startem

1. Zdecydować o commicie (użytkownik). Rekomendacja: zacommitować stan na
   `feat/three-d`, bo cała praca jest dziś tylko w drzewie roboczym. Bez atrybucji AI,
   Conventional Commits.
2. Sprawdzić drzewo: `npx tsc -p tsconfig.json --noEmit && npm run lint && npx vitest run --project unit`.
3. Serwer dev: konfiguracja `game` (5173) albo `game-alt` (5174) z `.claude/launch.json`.
   Jeśli 5173 zajmuje inny projekt — nie ruszać go; harness sam wybierze 5174.

### B. Dokończyć falę 2a i zaległości fali 1 (runner `world-steps.js`)

Wznowienie (ukończone kroki wracają z cache, o ile prompty się nie zmieniły):

```
Workflow({
  scriptPath: "~/.claude/projects/-Users-tomaszmarchewka-dev-ElectroNation/fa3123d6-0208-4504-918c-dd0c71b4c8a0/workflows/scripts/world-steps.js",
  resumeFromRunId: "wf_b92afc8c-020"
})
```

Pozostałe partie: [grid s2, cities s2] → [plants s2, res s2] → krytycy grid, cities,
plants, res → [terrain finish, sky finish] → [hud fix 2] → krytycy terrain, sky, hud →
rundy poprawek (maks. 2 na moduł w skrypcie; brief pozwala na 4 — w razie potrzeby
podnieść `MAX_FIX_ROUNDS`). **Nie edytować** tekstów `COMMON`, briefów ani
`RESUME_NOTE` w tym pliku — zmiana promptu unieważnia cache ukończonych kroków.

### C. Integrator po fali 2a

Zastosować zaległe prośby o zmiany z §6, uruchomić `npm run check` i `npm run e2e`,
zaktualizować `docs/STATUS.json` (rundy, oceny, zrzuty).

### D. Fala 2b — `world-steps-2b.js` (gotowy, nieuruchomiony)

storage, nodes (stacje, granice, place budowy), interaction; po dwa kroki, krytycy
(art + dyspozytor; dla interakcji krytyk UX + dyspozytor), rundy poprawek. Klatki
pokazowe w rejestrze już istnieją (`SHOWCASES.storage`, `SHOWCASES.nodes`).

### E. Fala 3 — `world-steps-3.js` (gotowy, nieuruchomiony)

effects (konsumuje haki), perf (realne progi jakości, cięcia GPU terenu i nieba,
bloom zachowujący barwę, pierwsza interakcja), audio (proceduralne, domyślnie
wyciszone), kuracja stanu pokazowego (audyt wymaganych stanów + klatki `game`).
Po fali: integrator wpina audio w `WorldView`, dodaje przełącznik `DŹWIĘK` i wybór
jakości w HUD, `npm run check`.

### F. Bramki końcowe (skryptu jeszcze nie ma)

1. Parytet mechaniczny: `git diff main -- src/engine` puste, goldeny bez zmian,
   smoke SVG zielony, etykiety świata = etykiety mapy SVG słowo w słowo.
2. Krytyk całej gry na klatkach `SHOWCASES.game`.
3. Ślepi sędziowie, pary A/B: my vs Cities: Skylines II; my vs mapa SVG w tym samym
   stanie. Przegrana pary czytelności („która linia jest przeciążona?") = twarda porażka.
4. `/loop` aż wszyscy krytycy zaliczą; wyniki do `docs/STATUS.json`.

### G. Dokumenty

Po każdej fali: `docs/STATUS.json`, tabela modułów w `ARCHITECTURE.md` §18,
`docs/08` §10 (decyzje). Ten plik usunąć albo zastąpić, gdy praca zostanie podjęta.

## 6. Zaległe prośby o zmiany (niezastosowane)

| Od | Cel (właściciel) | Treść |
| --- | --- | --- |
| res s1 | `showcase/registry.ts` (integrator) | `offshore-atlantic` (tura 4) trafia w ciszę wiatru — farma stoi; przenieść na turę wietrzną (tura 7 sprawdzona) i dodać dzienną klatkę z kręcącą się farmą po sprawdzeniu wiatru bałtyckiego > 3 m/s |
| res s1 | `bridge/showcase.ts` (integrator) | w `midgame` żadna farma nie jest wyłączona — kodowania „off" nie da się pokazać; dodać akcję wyłączenia np. `farm-pv-wzgorze` przed turą sądzenia |
| res s1 | terrain lub sky | biały wirujący nalot w zbliżeniach summerHigh w południe rysowany **na** geometrii innych modułów (zasłania panele PV) — ograniczyć do powierzchni terenu |
| res s1, terrain | `core/BoardOutline.ts` (integrator) | obrys heksów na morzu przecina farmę offshore — pominąć lub mocniej wygasić na heksach `sea` (dziś 1/3 krycia) |
| grid s2 | most: numeracja torów (integrator) | numeracja torów w kolejności stanu wymusza krzyżowania na wierzchołkach rozwidleń przy 5–9 torach; rozważyć numerację wg strony, w którą tor odchodzi (szczegóły w `grid/PROGRESS.md`) |
| grid s1 | `core/PostFx.ts` (perf, fala 3) | bloom progowany luminancją nie przepuszcza czerwieni; selektywny bloom na `LAYERS.bloom` albo próg `max(r,g,b)`, potem usunąć pule poświaty w grid |
| sky | `showcase/registry.ts` (integrator) | `noon-summer-high` w styczniu nie pokaże letniego nieba (słońce 15°) — dzień per klatka (`ShowcaseFrame.day`, np. doba 16 = czerwiec) |
| sky | `scripts/capture.mjs` / `CameraRig` (integrator) | `--yaw`/`--pitch`, żeby kadr świtu mógł patrzeć w słońce |
| sky | terrain | lustrzany biały odblask lądu przy słońcu < 8° — podnieść szorstkość pod kątem ślizgowym / ograniczyć `specularIntensity` |
| terrain | sky | mgła spiera daleką połowę planszy w widoku strategicznym; biały „śnieg" punktów w dzień |
| grid s1 | sky | w `summerLow` opad wygląda jak 8-pikselowe płatki śniegu w lecie |
| hud | `scripts/capture.mjs` (integrator) | przekazywać `--theme`; dodać `--select q,r` i `--report 1`, żeby stany HUD były odtwarzalne harnessem |
| hud | `src/app/styles` (integrator) | poniżej 1500 px dok raportu w układzie świata wypełnia cały obszar roboczy — nadać stałą szerokość |
| cities s1 | cities (krok 2) | czytać `HEIGHT_KM.landmark` zamiast lokalnej stałej `LANDMARK_HEIGHT_KM` |
| sky (stare) | hud | `pxPerKm is not defined` w `WorldLabels.tsx` — dziś 0 błędów w zrzutach, potwierdzić przy krytyce HUD |

## 7. Ryzyka i pułapki

- **Limit użycia sesji** jest głównym hamulcem. Maks. 2 agentów naraz, kroki ~40 min,
  `PROGRESS.md` pisany na starcie kroku i po każdym podzadaniu. Przebieg, który padł,
  wznawia się przez `resumeFromRunId`; agent zastaje pracę częściową i ma ją kontynuować.
- **Niezacommitowane drzewo** — patrz §1. Żadnych `git stash/reset/checkout` na cudzych
  plikach.
- **Skrypty orkiestracji** leżą w katalogu sesji (`~/.claude/projects/…/workflows/scripts/`),
  nie w repo; scratchpad pod `/private/tmp` jest czyszczony między dniami. Identyfikatory
  przebiegów i ścieżki są w `docs/STATUS.json → orchestration` i w pamięci projektu
  (`three-d-orchestration.md`).
- **Teksty o porcie w skryptach**: `world-steps.js` mówi agentom „serwer na 5173",
  skrypty 2b/3 — „na 5174, 5173 należy do innego projektu". Harness i tak sam znajduje
  właściwy serwer i wypisuje użyty adres; przed startem 2b/3 najprościej uruchomić
  `game-alt` (5174), żeby opis zgadzał się z rzeczywistością.
- **Zrzuty `--headed`** otwierają okno przeglądarki na maszynie; tylko one mierzą GPU
  (headless = SwiftShader, fps nie jest bramką).
- **Projekcja wydajności** (M3 Pro ≈ 2,5× GPU średniej klasy) to założenie zapisane
  w `src/world/perf/budget.ts`, nie pomiar na docelowym sprzęcie.

## 8. Zasady, których trzeba dalej pilnować

- `src/engine/**` zamrożony; goldenów nie przerejestrowywać; losowość renderera tylko
  z własnego PRNG; wszystko, co widać, pochodzi z `GameState` + `TurnReport` przez most;
  czego most nie wyprowadzi — wpis w `docs/STATUS.json → blockedEngineRequests`.
- Budowniczy edytuje tylko swój folder; rdzeń, most, rejestr, App, konfiguracja — integrator.
- Ocen nie zawyżać; testów nie luzować ani nie usuwać; `npm run check` zielone na granicy
  każdej fali; smoke Playwright zielony.
- Kod, komentarze, commity po angielsku; teksty gracza i `docs/` po polsku; zero
  atrybucji AI; bez commitów bez prośby; gałęzie `feat/…`, nigdy `claude/*`.
