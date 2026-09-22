# ElectroNation — Interfejs 3D: świat, czytelność, HUD

**Wersja:** 0.1
**Data:** 2026-09-02
**Status:** **obowiązuje** dla warstwy prezentacji: model reliefowy kraju w Three.js
i nakładka HUD. Zakres funkcjonalny interfejsu nadal definiuje [01 §8](01-mechanika-gry.md)
— ten dokument mówi wyłącznie, **jak** stan gry jest pokazywany w trzech wymiarach i czego
gracz ma nie musieć klikać, żeby go odczytać. Strona inżynierska tych samych decyzji:
[ARCHITECTURE.md](../ARCHITECTURE.md) (po angielsku, kontrakt modułów i sceny).

**Dokument nadrzędny:** [01-mechanika-gry.md](01-mechanika-gry.md) (§8 rezerwuje numer 08
dla projektu interfejsu). Numery, mechaniki i wszystkie parametry pochodzą z dokumentów
01/02/05/06 i z `CONFIG` silnika; ten dokument nie wprowadza ani jednej wartości gry.

---

## 1. Cel i zakres

Gra zostaje dokładnie tą samą grą: ta sama pętla tury, te same liczby, te same decyzje.
Zmienia się to, na co gracz patrzy: zamiast planszy SVG widzi **fizycznie oświetlony model
reliefowy kraju** — teren, materiały, słońce, niebo i pogodę w pełni fotorealistyczne,
a instalacje w skali znacznika mapy, z jawnym przewyższeniem (§2). Silnik (`src/engine/`)
nie zmienia się o bajt; wszystko, co świat pokazuje, wynika ze stanu gry i raportu tury
przez jeden moduł mostu (ARCHITECTURE §3).

Dwie rzeczy są w tym dokumencie ważniejsze od urody:

1. **Kontrakt czytelności** (§3) — to gra dyspozytorska, nie wygaszacz ekranu. Piękno, które
   kosztuje odczyt, jest błędem.
2. **Polityka ruchu** (§4) — świat 3D się porusza, więc zasada „interfejs jest statyczny"
   z handoffu zostaje **uchylona dla warstwy świata** i zastąpiona regułami, co, jak szybko
   i jak to wyłączyć.

## 2. Świat: skala i przewyższenie

- Jednostka świata = **1 km**, oś Y w górę, północ = −Z, wschód = +X.
- Heksy flat-top w układzie odd-q silnika (`axialToOffset`); **rozstaw sąsiednich środków
  = 25 km** (01 §3.1). Krok kolumny 21,65 km (1,5 × R), krok rzędu 25 km; mapa v1 (24×16) ma
  **527 × 412 km**.
- Szerokość geograficzna 52° N (06 §2) — jedno słońce dla całego kraju.

Przy prawdziwej skali elektrownia jest niewidoczną kropką, więc instalacje rysuje się
w skali znacznika mapy. **Współczynnik przewyższenia jest jawny, jeden na klasę obiektu,
zadeklarowany w jednym pliku** (`src/world/render/core/exaggeration.ts`) i nigdy nie jest
dobierany per model:

| Klasa | Realnie | Współczynnik | W świecie |
|---|---|---|---|
| Relief terenu | 0–2,5 km | ×3 | 0–7,5 km |
| Słup NN / SN / WN | 30 / 45 / 60 m | ×20 | 0,6 / 0,9 / 1,2 km |
| Turbina wiatrowa (do końcówki łopaty) | 150 m | ×20 | 3 km |
| Chłodnia kominowa / komin | 150 / 250 m | ×20 | 3 / 5 km |
| Obudowa bezpieczeństwa (jądrowa) | 60 m | ×20 | 1,2 km |
| Hala, kontener BESS, bramka rozdzielni | 15–30 m | ×20 | 0,3–0,6 km |
| Blok miejski | 20–40 m | ×20 | 0,4–0,8 km |
| Plac elektrowni | ~1 km | ×8 | ~8 km (⅓ heksa) |
| Farma | — | 40–70 % heksa wg szczebla | — |
| Miasto | — | 25–80 % heksa wg gospodarstw | — |

Jeden współczynnik dla wszystkich obiektów pionowych sprawia, że sylwetki zachowują realne
proporcje między sobą (komin wyższy od chłodni, turbina wyższa od słupa). Słupy stoją co
6 km wzdłuż trasy (cztery na krok heksa); zwis przewodu = 8 % rozpiętości, żeby był
widoczny z widoku strategicznego.

## 3. Kontrakt czytelności

W dowolnej chwili, bez klikania, gracz musi odczytać z samego obrazu: która linia jest
przeciążona, które miasto ma niedobór, która jest godzina, które bloki pracują, a które
dopiero się rozruchowują, co robi pogoda. Stan koduje się w **świetle, emisji, ruchu
i sylwetce** — nigdy przez przemalowanie materiału ani plakietkę, która zasłania obiekt.

| Pytanie dyspozytora | Kodowanie w świecie | Twarde progi |
|---|---|---|
| Która linia jest przeciążona? | przewód **świeci**: bez przepływu — nie świeci; OK — słabo biało; ≥ 75 % — bursztynowo; ≥ 99,5 % — czerwono, z wolnym „oddechem" 0,5 Hz; najgorsze wąskie gardło ma dodatkowo czerwony pierścień na ziemi i etykietę `WN 1 500/1 500 ⚠` | progi jak na mapie SVG (`sceneModel.ts`: 0,75 / 0,995) |
| Które miasto ma niedobór? | okna miasta świecą proporcjonalnie do **udziału dostarczonej mocy**; przy ENS > 0 czerwony pierścień na ziemi i etykieta z `−ENS`; miasto niepodłączone — ciemna osada bez pierścienia | `lit = dostarczone / popyt` |
| Która godzina? | pozycja i barwa słońca, niebo, cienie, światła miast; godzina w pasku górnym | godzina = środek bloku tury (NOC → 01:30 … PÓŹNY WIECZÓR → 22:30) |
| Które bloki pracują / startują? | **w ruchu** — ciepłe okna hali + smuga i para skalowane **produkcją**, nie nastawą; **w rozruchu** — pomarańczowa poświata rozgrzewania narastająca z licznikiem, cienka smuga; **wyłączony** — ciemny | `outputMw / mw`, `startupTurnsLeft` |
| Co robi pogoda? | niebo, chmury, opad, mgła, wirniki; pasek pogody HUD z liczbami ostatniej rozstrzygniętej tury | prawda tury rozstrzygniętej (ujawniona — 06 §8.6.1) |
| Która farma jest wyłączona / przycięta? | wyłączona — wirniki stoją, światła gondoli zgaszone; przycięta — bursztynowy pierścień u podstawy | `enabled`, `curtailedMw` |
| Co jest w budowie? | rusztowanie i dźwig, sylwetka rosnąca z postępem, etykieta `BUDOWA · 2 DOBY` | `remainingDays / totalDays` |
| Którędy pójdzie linia? | wstęga trasy na terenie w kolorze akcji (czerwona, gdy trasa niedozwolona), koszt przy końcu trasy | ten sam rachunek, co w panelu trasowania |

Wirnik turbiny czyta się wprost z krzywej mocy 06 §6.3: poniżej 3 m/s stoi, między 3 a 12
m/s kręci się tym szybciej, im bliżej mocy znamionowej, od 12 do 25 m/s kręci się pełną
prędkością, **od 25 m/s łopaty są ustawione w chorągiewkę i wirnik stoi** — sztorm ma być
widoczny jako zatrzymanie. Dunkelflaute ma wyglądać jak Dunkelflaute: wyż zimowy mroźny to
twarde, niskie, mroźne światło i nieruchome wirniki; wyż z mgłą to szara, bezcieniowa
mleczność i ciemne PV.

Etykiety zakotwiczone w świecie drukują **dokładnie te same teksty**, które drukowała mapa
SVG (`EC MODRZYCA CCGT · 320/400`, `KRASNÓW · 300 MW`, `BUDOWA · 2 DOBY`) — renderer nigdy
nie wymyśla liczby.

**Ocena.** W każdej rundzie krytyków czytelność jest punktowana **osobno** od plastyki
(pytania na czas z samego zrzutu ekranu), a jej porażki nie da się odkupić wyższą oceną
artystyczną.

## 4. Polityka ruchu

Reguła handoffu „interfejs jest statyczny, zero ruchu" (`tokens/motion.css`, `brand-motion`)
zostaje **uchylona dla warstwy świata**. Nakładka HUD pozostaje statyczna jak dotąd
(przejścia kontrolek 120 ms i nic więcej).

| Co się porusza | Tempo | Co stoi |
|---|---|---|
| wirniki (od wiatru), smugi i para (od produkcji), chmury (od wiatru), opad, woda | ciągle, wolno | teren, słupy, budynki |
| cząstki przepływu na obciążonych przewodach | ~1 heks/s | linie bez przepływu |
| „oddech" przeciążenia | 0,5 Hz, amplituda 30 % | linie OK / >75 % |
| przejście rozstrzygnięcia tury (słońce, światła, przepływy) | raz, 1,5 s | HUD |
| ruch kamery (dolot, presety) | 0,6 s | — |

Ustawienie `RUCH: PEŁNY / OGRANICZONY / BRAK` w pasku ustawień (dół ekranu, obok motywu):

- **OGRANICZONY** (domyślny także wtedy, gdy system operacyjny prosi o mniej ruchu):
  bez oddechu, bez cząstek, bez dryfu chmur; wirniki i smugi nadal się poruszają, bo niosą
  stan (prędkość wirnika = wiatr, smuga = produkcja).
- **BRAK**: wszystko zamrożone. Każdy sygnał animowany ma statycznego bliźniaka (emisja,
  sylwetka, pierścień), więc stan czyta się bez ruchu.

Rozstrzygnięcie tury jest jedynym momentem „widowiskowym" (01 §2.3): słońce przesuwa się
z poprzedniej godziny na nową, zapalają się światła, ruszają przepływy. Z ruchem
ograniczonym albo wyłączonym dzieje się to natychmiast.

## 5. Czas i światło

- Świat pokazuje **turę ostatnio rozstrzygniętą** (`lastTurnReport`) i nigdy nie cofa się ze
  wstęgą czasu (01 §8 pkt 1). Przed pierwszym rozstrzygnięciem pokazuje turę oczekującą bez
  przepływów; HUD mówi wtedy wprost `brak rozstrzygnięcia`.
- Słońce **nie jest dekoracją**: deklinacja, kąt godzinowy i wysokość pochodzą
  z `src/engine/astronomy.ts` (06 §3); azymut (06 §3.5) most liczy z tych samych
  wyeksportowanych prymitywów — silnika nie trzeba ruszać. Kontrola: 21 czerwca α_max 61,5°,
  dzień 16 h 44 min; 21 grudnia α_max 14,6°, dzień 7 h 44 min (06 §3.7). Grudniowy zachód
  ~15:30 przy szczycie 16–18 (06 §9) ma **wyglądać** jak najtrudniejszy moment gry: szczyt
  wieczorny grudnia to noc.
- Noc jest dramatem: miasta świecą mocą **faktycznie dostarczoną**; niedobór gasi miasto
  natychmiast, dokładnie tam, gdzie rozpływ je zagłodził.

## 6. Pogoda

Jedna prawda pogodowa dla kraju (02 §7). Most odtwarza prawdę pokazywanej doby czystą
funkcją silnika `generateDayTruth`, gdy raport dotyczy doby, której stan już nie trzyma.

| Wejście (06) | Wyjście w świecie |
|---|---|
| zachmurzenie C ∈ [0,1] | mętność nieba, pokrycie warstwy chmur, cienie chmur na terenie; zapaść PV siedzi już w GHI (06 §4.4: C=1 → 25 % nieba bezchmurnego) |
| reżim + C + temperatura | rodzaj i natężenie opadu (deszcz / śnieg z deszczem / śnieg), mgła, zamglenie |
| średnia dobowa temperatura (+ reżim) | pokrywa śnieżna nizin 0..1; teren wyprowadza z niej linię śniegu |
| wiatr per klasa lokalizacji | stan wirnika (§3), dryf chmur, skos opadu |
| reżim | kierunek wiatru (bazowy per reżim + deterministyczny rozrzut dobowy z PRNG) |

Osiem reżimów 06 §8.2 ma osiem rozpoznawalnych twarzy; sztorm i oba wyże zimowe są z nich
najważniejsze, bo to one są testem gracza.

## 7. HUD

Nakładka React nad sceną: **warstwowa, świadoma głębi, czytelna zarówno na śnieżnym polu
w południe, jak i na czarnej mapie o 03:00**. Panele stoją na powierzchniach o wysokim
kryciu (tokeny tła, ≥ 0,88) z jednopikselową krawędzią; tekst zakotwiczony w świecie ma
halo i podkładkę. Rozmycie tła jest dopuszczone wyłącznie pod panelami nad światem —
to jedyne uchylenie reguły „blur nie występuje" i dotyczy tylko powierzchni graniczących
ze sceną.

Kanon bez zmian (handoff + `src/app`): język polski, terminy branżowe (nastawa, bilans,
przepustowość, energia niedostarczona, przyłącze, reżim pogodowy); etykiety sekcji i nazwy
obiektów WERSALIKAMI MONO, technologia jako dopisek; **diagnoza zamiast alarmu** — każdy
komunikat mówi, skąd wzięła się liczba; liczby z przecinkiem, spacją tysięcy, minusem
U+2212, pieniądze bez groszy, nastawa `wartość / maks.`, prognoza zawsze `±`, jednostki
zawsze; glify `✓ ⚠ ✕ ◂ ▸ ⏭ ⬡` i nic więcej, bez emoji; dokładnie jedna akcja główna na
ekranie (`ZATWIERDŹ TURĘ ▸`); przycisku auto-dyspozycji nie ma i nie będzie.

Każdy panel, który istnieje dziś, przetrwał w tej samej treści (modele widoku
`src/app/panel/*`, `timeline`, `report` są kontraktem testów komponentów):

| Panel | W HUD 3D |
|---|---|
| pasek górny (kontekst, reżim, KPI, RAPORTY) | u góry, na całą szerokość, nad sceną |
| panel dyspozytora / panel heksa / trasowanie (jedna kolumna 400 px) | zadokowany po prawej, nad sceną; scena widoczna pod nim jest rozmyta |
| prognoza z pasmami, kolumna „bilans przy obecnych nastawach" | bez zmian |
| suwaki nastaw per blok z bursztynowym znacznikiem mocy bieżącej | bez zmian |
| kolejka budów, systemy prognostyczne | bez zmian |
| wstęga czasu z wykresem pokrycia (prawda pełna, plan szrafurą) | dół lewej kolumny, nad sceną |
| pasek raportu tury | dół, na całą szerokość |
| raport okresowy | dok obok panelu, jak dotąd |
| zapis / wczytanie, motyw | pasek narzędzi na dole legendy |

Nowe elementy HUD:

- **etykiety zakotwiczone w świecie** — teksty mapy SVG rzutowane co klatkę na pozycje
  obiektów, z priorytetem (alarmy nad nazwami), wygaszane z odległością i zasłonięciem;
- **pasek pogody** — liczby ostatniej rozstrzygniętej tury: wiatr [m/s] per klasa,
  zachmurzenie, temperatura, GHI, śnieg; z notą `Dunkelflaute`, gdy warunki 06 §12.12;
- **pasek ustawień** — `RUCH`, `JAKOŚĆ: AUTO / WYSOKA / ŚREDNIA / NISKA`, `RENDERER: 3D / SVG`;
- **linia diagnostyki** — `⚠ moduł <id> wyłączony — <błąd>`: awaria jednego modułu gasi jego
  warstwę, nigdy grę;
- **baner podglądu** — w trybie przechwytywania z nadpisaną pogodą (`?regime=`) HUD mówi
  `PODGLĄD POGODY: <reżim>`, żeby zrzut nie udawał stanu gry.

## 8. Interakcja

- **Kamera**: widok strategiczny (cała plansza, nachylenie ~50°) → zbliżenie do jednego
  heksa (~15 km). Przeciąganie lewym przyciskiem = przesuw, kółko = zbliżenie do kursora,
  prawy przycisk = obrót, klawisze `1`/`2`/`3` = presety, `F` = dolot do wybranego heksa.
  Kamera nigdy nie schodzi pod teren ani poza planszę.
- **Wybór heksa**: klik = wybór (panel heksa, 01 §8 pkt 6); najechanie podświetla obrys
  heksa; podczas trasowania klik działa jak dziś (obiekt docelowy → punkty pośrednie).
- **Trasowanie linii**: wstęga podglądu na terenie, koszt i czas przy końcu trasy — liczby
  z `routing/session.ts`, te same, które silnik policzy.
- Bez WebGL2 gra działa na mapie SVG w tej samej nakładce, z notą `⚠ brak WebGL2 — mapa
  w trybie SVG`.

## 9. Weryfikacja

- **Harness przechwytywania** (`scripts/capture.mjs`): ziarno, doba, tura, reżim, preset
  kamery i zegar animacji są przypięte parametrami URL; narzędzie czeka na sygnał „scena
  gotowa" i zapisuje PNG + JSON (błędy konsoli, fps, `renderer.info`, szacunek pamięci GPU,
  werdykt budżetu). Te same wejścia → porównywalny bajt w bajt PNG.
- **Trasy pokazowe** (`?showcase=<moduł>`): każdy moduł ma scenę reprezentatywną w kilku
  porach doby i reżimach, domyślnie na dobie sądzenia stanu `midgame` (doba 1: EJ w ruchu,
  korytarz Łęgi w trakcie podniesienia do WN, drugi blok węglowy w rozruchu). Parametr
  `modules=a,b,c` ładuje tylko wskazane moduły — koszt warstwy to różnica między zrzutem
  z nią i bez niej. Nikt nie twierdzi niczego, czego nie zrzucił i nie obejrzał.
- **Serwer deweloperski**: harness sam uruchamia Vite, gdy nic nie odpowiada pod `--url`;
  gdy port zajmuje INNA aplikacja, nie rusza jej i szuka lub uruchamia nasz serwer na
  portach zapasowych 5174, 5183, 5193 (log `capture: using the ElectroNation server at …`).
- **Krytycy**: dyrektor artystyczny (0–10 wobec referencji: Cities: Skylines II, MSFS 2024,
  Anno 1800, Transport Fever 2, fotografia linii WN, rozdzielni, farm, smug chłodni,
  nocne zdjęcia satelitarne) i krytyk-dyspozytor (0–10 z pytań na czas ze zrzutu).
  Zaliczenie = oba ≥ 8,5, zero błędów konsoli, budżet, `npm run check` zielone.
- **Bramki końcowe**: parytet mechaniczny (silnik bajt w bajt, goldeny bez zmian, smoke
  Playwright zielony), ocena stanu pokazowego całej gry, ślepi sędziowie (pary zrzutów A/B:
  my vs Cities: Skylines II; my vs mapa SVG — „która linia jest przeciążona?" musi być
  szybsze u nas, inaczej twarda porażka).
- Wyniki, rundy, otwarte uwagi, zablokowane prośby do silnika i ścieżki zrzutów:
  `docs/STATUS.json`.

## 10. Decyzje i pytania otwarte

| # | Decyzja |
|---|---|
| ✅ | Silnik zamrożony; jeden most; brak zmian `GameState` — czego most nie wyprowadzi, ląduje w `STATUS.json` jako blokada |
| ✅ | Skala: 1 jednostka = 1 km, rozstaw heksów 25 km, przewyższenie jawne per klasa (§2) |
| ✅ | Świat pokazuje turę ostatnio rozstrzygniętą; godzina = środek bloku |
| ✅ | Polityka ruchu §4 uchyla „interfejs statyczny" tylko dla świata; trzy ustawienia `RUCH` |
| ✅ | Panele dzisiejsze przetrwały w tej samej treści; nowa jest nakładka, etykiety w świecie, pasek pogody, ustawienia, diagnostyka |
| ✅ | Mapa SVG zostaje jako renderer zapasowy (bez WebGL2, `?renderer=svg`) i jako punkt odniesienia ślepego testu czytelności |
| ✅ | Zasoby wyłącznie CC0 lub proceduralne; w tej wersji wszystko proceduralne |
| ✅ | `three@0.184.0` — najnowsze wydanie osiągalne w środowisku budowy (rejestr npm niedostępny) |

Otwarte / zablokowane:

1. **Kierunek przepływu na segmencie** — raport tury niesie `usedMw` bez znaku; most
   wnioskuje kierunek heurystycznie (odległość skokowa od węzłów produkujących). Prośba do
   silnika o `usedMw` ze znakiem — `STATUS.json`.
2. Czy trzy poziomy jakości wystarczą na słabszych GPU — do weryfikacji pomiarem
   (`perf`), a nie deklaracją.
