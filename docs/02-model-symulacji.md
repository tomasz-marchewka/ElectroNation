# ElectroNation — Model symulacji uproszczonej (silnik tury)

**Wersja:** 0.8
**Data:** 2026-08-20
**Status:** **obowiązuje** — formalizuje rdzeń mechaniki z dokumentu 01 §4 (graf sieci,
rozpływ, straty, niedobory) oraz krok rozstrzygnięcia tury. Wprowadzona tu zmiana 01 §4.1
(nadwyżka sterowalna karana) obowiązuje od 01 v0.16.

**Zmiany 0.7 → 0.8 (kara za nadwyżkę obejmuje OZE; linia do placu budowy):** §5.1 — podstawą kary bilansowej
jest **suma zrzutu wszystkich źródeł**, nie sama produkcja sterowalna; OZE przestaje być
przycinane za darmo (01 §4.1 w 0.23). Stawka bez zmian, 400 zł/MWh. §5.2 — wyliczenie
92. percentyla **zostaje w mocy**: dotyczy nastawy sterowalnych wobec `popyt − OZE`,
a krańcową nadwyżką jest niemal zawsze blok sterowalny, bo merit order przycina go
pierwszy. §8 — **końcem trasy linii może być plac budowy**, nie tylko gotowy obiekt
(01 §3.3 w 0.23): przyłącza rezerwuje się w chwili budowy linii, więc plac nie zbierze
więcej końców, niż obiekt będzie miał gniazd, a stacja rozdzielcza w budowie liczy się
od razu jako 12-gniazdowa. Obiekt ukończony bez gotowej linii przy heksie wchodzi
wyłączony (01 §5.2 w 0.23) — w silniku dotyczy to wyłącznie farmy, bo reszta i tak
startuje z nastawą zero.

**Zmiany 0.6 → 0.7 (wiatr morski):** §8.1 — tabela terenu dostaje **trzecią kolumnę**:
morze przyjmuje **farmę wiatrową za ×2,5**, a odmowa `budowa niemożliwa` przestaje
dotyczyć całej wody i całego katalogu naraz (01 §3.2, §5.2 w 0.22). §8.4 — limit mocy
heksa i czas budowy farmy wiatrowej **zależą od terenu**: 300 MW / 1 doba na lądzie,
600 MW / 2 doby na morzu. Rozpływ, straty i rachunek tury bez zmian — morska farma jest
w grafie zwykłym źródłem OZE; nowy test akceptacyjny §9.14.

**Zmiany 0.5 → 0.6 (stacja rozdzielcza bez przepustowości):** §2 — jedynym węzłem
z własną przepustowością zostaje **przyłącze graniczne**; stacja rozdzielcza przepuszcza
wszystko, co przyniosą linie, i ma 12 przyłączy bez rozbudowy (01 §4.3, §5.4 w 0.21).
Rachunek rozpływu bez zmian — ubywa tylko jedno ograniczenie węzłowe; §9.6 przepisany
z „cienkiej stacji" na cienki korytarz.

**Zmiany 0.4 → 0.5 (linia przerywana na obiekcie):** §2 — rozpad linii na segmenty
przestaje być wyłącznie operacją grafu: gotowa linia jest **przecięta na mijanym obiekcie
w samym stanie gry** (01 §3.3 w 0.19), więc segment grafu i linia stanu znów się pokrywają.
Rachunek rozpływu, strat i przepustowości bez zmian — zmienia się tylko to, co silnik
zapisuje; nowy test akceptacyjny §9.13.

**Zmiany 0.3 → 0.4 (archiwum tur):** krok rozstrzygnięcia dostaje punkt 9 — **skrót tury**
dopisywany do trwałego archiwum w stanie gry (§4.1), pod wstęgę czasu i podgląd tur wstecz
z 01 v0.18 §8 pkt 2. Rachunek rozpływu, kar i finansów bez zmian; nowy test akceptacyjny
§9.12.

**Zmiany 0.2 → 0.3:** reguła rozbudowy §8.4 rozszerzona na **linie** (01 §4.2 w 0.17):
85% CAPEX-u / 70% czasu typu docelowego, praca na starym typie do końca robót, miejsce
w korytarzu zajęte w obu typach; nowy test akceptacyjny §9.11.

**Zmiany 0.1 → 0.2:** szkic zatwierdzony przez projektanta — dokument obowiązuje;
dokument 01 podbity do 0.16 (kara za zrzut w §4.1, sformalizowany rozpływ w §4.4,
alokacja niedoboru w §4.5, uzupełnione parametry §3.2, §5–§7, tabela decyzji §11).

**Decyzje projektanta (2026-08-13), które ten dokument zapisuje:**

1. **Model strat: przybliżenie ścieżkowe**, nie pełny „generalized flow" — trasowanie
   kolejno najtańszymi ścieżkami, straty odejmowane wzdłuż trasy (§3).
2. **Nadwyżka jest karana** — gracz ma nie nadstawiać „na zapas"; wysokość kary
   wyliczona tak, by zakład o prognozę miał dwie strony (§5).
3. **Niedobór wynika z odległości**: miasta bliżej źródeł konsumują pierwsze
   (także miasta „w przelocie" na trasie linii), miasta dalekie lub położone za innymi
   dostają mniej i to one mają niedobór — alokacja emergentna z rozpływu (§6).
4. **Priorytet zaspokajania: miasta → ładowanie magazynów → eksport** (§4).
5. **Mapa v1 = jedna ręcznie zaprojektowana mapa** (dane scenariusza): mała **24×16**,
   **8–12 miast**; generator proceduralny — dokument 07 (§8.6).
6. **Linie mogą przechodzić przez jezioro i morze** — mnożniki terenu w §8.1; **na morzu
   stoi też farma wiatrowa** (0.7; 01 §3.2 w 0.22).
7. **CAPEX magazynów** — §8.2. 8. **Koszty stałe wszystkich obiektów** — §8.3.
9. **Rozbudowa: 70% czasu, 85% CAPEX-u, limit 6 bloków; OZE: wiatr ≤300 MW/heks na lądzie
   i ≤600 MW/heks na morzu (0.7), PV ≤200 MW/heks** (§8.4).
10. **Błąd prognozy popytu: jeden czynnik systemowy** (nie per miasto) (§7).
11. **Prawda pogodowa: jedna dla całego kraju**; heks różnicuje ją tylko parametrami
    lokalizacji (klasa wiatru, nasłonecznienie) (§7).

---

## 1. Cel i zakres

Dokument przekłada 01 §4 (bilans turowy, przepływ „wodociągowy") na jednoznaczną
specyfikację silnika: reprezentację grafu, funkcję celu rozpływu, obsługę strat,
kolejność kroków rozstrzygnięcia tury, rozliczenie nadwyżki i niedoboru oraz integrację
z pogodą i prognozami (06) i modelem zapotrzebowania (05). Wartości ekonomiczne
uzupełniające katalogi 01 §5 zebrane w §8 są **baseline'em dla dokumentów 03/04/07**.

## 2. Graf sieci

- **Węzły** = wszystkie obiekty punktowe (01 §3.3): elektrownie, farmy OZE, magazyny,
  stacje rozdzielcze, miasta, przyłącza graniczne. Węzeł ma limit przyłączy liniowych
  (6; stacja rozdzielcza 12 — 01 §5.4 w 0.21). **Przepustowość węzła [MW]** ma od 0.21
  już tylko **przyłącze graniczne** — suma mocy przepływającej przez nie ≤ limit
  (01 §5.7). Pozostałe węzły, stację rozdzielczą włącznie, przepływu nie ograniczają.
- **Krawędzie** = linie przesyłowe: typ (NN/SN/WN → przepustowość 150/500/1500 MW),
  długość w heksach trasy (1 heks = 25 km), współczynnik strat typu (4/2/1% na 100 km,
  01 §4.2). Straty krawędzi: `sprawność = 1 − k_strat × długość_km / 100`.
- **Obiekt mijany przez linię** (01 §3.3) jest pełnoprawnym węzłem na trasie — linia
  rozpada się w grafie na segmenty między kolejnymi węzłami. Każdy segment dziedziczy
  typ i przepustowość linii; straty liczone po długości segmentu. Od 01 v0.19 gotowa
  linia jest **przecięta na obiekcie już w stanie gry** (dwie osobne linie, dwa przyłącza),
  więc na trasie gotowej linii segment = linia; podział w grafie pozostaje w silniku dla
  linii dopiero uruchamianych i dla stanów wczytanych ze starszych zapisów.
- **Tory równoległe** = osobne krawędzie na tej samej trasie (sumują przepustowość).
- **Źródła** w turze: elektrownie sterowalne (nastawa gracza), farmy OZE (produkcja
  z pogody, o ile farma włączona), magazyny w trybie rozładowania (nastawa), import
  (nastawa, przez przyłącze graniczne). **Odbiory**: miasta przyłączone (prawda popytu
  wg 05 §4), magazyny w trybie ładowania (nastawa), eksport (nastawa, przez przyłącze).

## 3. Rozpływ: cel i algorytm

### 3.1 Funkcja celu

**DECYZJA:** rozpływ realizuje dwa cele leksykograficznie:

1. **maksymalizuj energię dostarczoną** do odbiorów bieżącego priorytetu (§4),
2. przy remisie **minimalizuj koszt** = koszt zmienny źródła + wartość energii
   traconej po drodze.

Jednostkowy koszt dostarczenia z węzła źródłowego `s` trasą `P`:

```
koszt(s, P) = koszt_zmienny(s) / sprawność(P)        [zł za MWh dostarczoną]
sprawność(P) = iloczyn sprawności segmentów trasy
```

Dzielenie przez sprawność ujmuje straty: żeby dostarczyć 1 MWh długą stratną trasą,
trzeba nadać więcej, więc koszt na MWh dostarczoną rośnie z odległością. To jedna
formuła daje jednocześnie: merit order użycia źródeł (OZE i magazyn = koszt 0 idą
pierwsze, potem jądrowa → węgiel → CCGT → OCGT → import) i preferencję krótkich tras.

### 3.2 Algorytm — kolejne najtańsze ścieżki

**DECYZJA (1): przybliżenie ścieżkowe** zamiast pełnego „generalized flow":

```
dopóki istnieje para (źródło z wolną nastawą, odbiór z niepokrytym poborem)
osiągalna trasą z wolną przepustowością:
  1. znajdź parę o najmniejszym koszt(s, P)  (Dijkstra po koszcie krawędzi)
  2. prześlij Δ = min(wolna nastawa źródła × sprawność(P),
                      wolna przepustowość wąskiego gardła trasy przeliczona na odbiór,
                      niepokryty pobór odbioru)
  3. zaktualizuj rezydualne przepustowości krawędzi i węzłów (moc NADANA
     na każdym segmencie, tj. przed stratami tego segmentu)
```

- Grafy są małe (dziesiątki węzłów), więc pętla jest tania; wynik jest w pełni
  **deterministyczny** przy stałych tie-breakach: przy równym koszcie najpierw
  mniejsze id źródła, potem mniejsze id odbioru, potem trasa leksykograficznie
  po id krawędzi.
- Świadome odstępstwo od optimum: algorytm zachłanny może w rzadkich topologiach
  dostarczyć mniej niż idealny przepływ (brak przekierowań). Akceptowane — zachowanie
  jest przewidywalne i czytelne dla gracza („woda płynie najkrótszą wolną rurą"),
  a to ono jest mechaniką.

### 3.3 Rachunek strat i energii

Wielkości tury są średnimi MW bloku 3 h; energia = MW × 3 h (01 §2.2). Straty tury =
suma (moc nadana − moc odebrana) po wszystkich segmentach × 3 h. Straty nie są
przychodem nikogo — gracz płaci za nie paliwem u źródła (01 §6).

## 4. Krok rozstrzygnięcia tury (klik „następna tura" — 01 §2.3)

Kolejność jest częścią kontraktu silnika:

1. **Ujawnienie prawdy**: pogoda bloku (06), popyt miast (05 §4).
2. **Produkcja OZE** z pogody (farmy włączone); zebranie nastaw gracza: elektrownie,
   magazyny (ładuj/oddawaj), import/eksport.
3. **Rozpływ — przebieg 1: miasta.** Wszystkie źródła, odbiory = miasta.
4. **Rozpływ — przebieg 2: ładowanie magazynów** na przepustowościach rezydualnych.
   Do magazynu wchodzi energia × sprawność ładowania (połowa strat cyklu).
5. **Rozpływ — przebieg 3: eksport** na tym, co zostało.
6. **Zrzut i kara** (§5): niewykorzystana produkcja **wszystkich** źródeł (sterowalne
   i OZE) oraz import.
7. **Niedobory i kary** (§6): energia niedostarczona per miasto (wejście do 05 §6.1).
8. **Finanse tury**: przychód (taryfa × energia dostarczona), koszty zmienne
   (od energii **wykorzystanej**, §5), kara za zrzut, kara za niedobór; postęp budów
   (linie: długość bloku, obiekty: licznik dób). Koszty stałe nalicza się raz na dobę
   (01 §6). SOC magazynów po sprawnościach.
9. **Archiwum**: dopisanie **skrótu tury** (§4.1) na koniec trwałego archiwum w stanie gry.

Priorytet miasta → ładowanie → eksport (**DECYZJA 4**) obowiązuje przez rozdzielenie
na trzy przebiegi: przy ciasnej sieci eksport i ładowanie nigdy nie odbierają miastom
przepustowości.

### 4.1 Skrót tury — archiwum pod wstęgę czasu

Wstęga czasu i podgląd tur wstecz (01 §8 pkt 2, §2.5) wymagają, żeby **każda rozstrzygnięta
tura** została w stanie gry na zawsze — także po wczytaniu zapisu. Trzymanie w tym celu
pełnych raportów tur jest wykluczone rachunkiem: pełny raport waży ~3,7 KB na sieci
średniozaawansowanej (4 miasta, 7 źródeł, 11 segmentów), z czego połowę zjadają przepływy
per segment; na dojrzałej sieci (~150 segmentów) to 25–30 KB. Rok gry = 288 tur, czyli
1 MB → 7–8 MB **na rok gry**, serializowanych przy każdym autozapisie, czyli po każdej turze.

**DECYZJA: archiwum trzyma skrót, nie raport.** Skrót zawiera dokładnie tyle, ile rysuje
wstęga i pisze pasek raportu:

| Grupa | Zawartość |
|---|---|
| Pozycja | doba, tura, typ doby, miesiąc, reżim, waga doby |
| Sumy | popyt, dostarczenie, niedobór, straty, zrzut sterowalny, przycięcie OZE |
| Pokrycie | 7 warstw mocy **wykorzystanej**: jądrowa, węgiel, gaz, wiatr, PV, magazyn, import |
| Zakład z prognozą | popyt / wiatr / PV: prognoza, pasmo ±1σ z chwili zakładu, prawda |
| Finanse | pełne rozbicie przychodów, kosztów i kar + `net` równy zmianie budżetu |
| Niedobór | lista miast z niedoborem (identyfikator + moc), tylko niezerowe |

Skrót waży ~0,7 KB, czyli **~200 KB na rok gry** i ~2 MB na dziesięć lat gry — na tyle
mało, że archiwum jest **nielimitowane**; nie ma progu, po którym gra zapomina turę.

Trzy konsekwencje, które są częścią kontraktu:

1. **Rozbicie na warstwy liczy silnik w chwili rozstrzygnięcia**, nie interfejs przy
   rysowaniu. Technologia źródła jest własnością obiektu, a obiekty przybywają i zmieniają
   się w czasie; historia nie może zależeć od tego, co stoi na mapie dzisiaj.
2. **Pełny raport pozostaje wyłącznie dla tury ostatniej.** To on zasila kolorowanie mapy
   i warunki stopu przewijania (01 §2.5) — obie rzeczy dotyczą teraźniejszości, a mapa
   z założenia nie cofa się razem ze wstęgą (01 §8 pkt 1).
3. **Archiwum jest wynikiem, nie źródłem losowości**: żadnego PRNG, dopisanie w czasie
   stałym, koszt tury niezależny od długości historii (test wydajnościowy „rok gry
   pozostaje liniowy").

## 5. Nadwyżka — zrzut i kara

### 5.1 Mechanika

Po przebiegach rozpływu każdemu źródłu zostaje `zrzut = nastawa − wykorzystanie`
(dla OZE: `produkcja − wykorzystanie`). **DECYZJA (2):**

- **OZE**: zrzut karany tak samo jak sterowalny — **400 zł/MWh** (0.8; uchyla darmowy
  zrzut OZE). Rozpływ używa OZE pierwsze (koszt 0), więc OZE jest przycinane efektywnie
  **ostatnie**: kara sięga po nie dopiero, gdy pogoda przerasta cały odbiór sieci albo
  gdy wąskie gardło odcina farmę. Gracz broni się magazynem, eksportem albo wyłączeniem
  całej farmy (01 §5.2) — farma wyłączona nie produkuje i nic nie jest winna.
- **Elektrownie sterowalne**: paliwo płacone **tylko od energii wykorzystanej**;
  każda MWh zrzutu kosztuje **karę bilansową 400 zł/MWh**.
- **Podstawa kary** = `zrzut sterowalnych + przycięcie OZE`, jedną stawką. Silnik trzyma
  obie sumy osobno (`dumpMw`, `resCurtailedMw`), żeby raport mógł powiedzieć, skąd wzięła
  się nadprodukcja, ale nalicza z nich jedną pozycję (`dumpPenaltyPln`).
- **Import**: kontrakt take-or-pay — **płatny od nastawy** (800 zł/MWh), zrzut bez
  dodatkowej kary (nadmiar importu boli już ceną).
- **Magazyn**: niewykorzystana nastawa rozładowania po prostu zostaje w magazynie —
  bez kary (nastawa „oddawaj do X MW" jest ofertą, nie zobowiązaniem).

### 5.2 Wysokość kary — wyliczenie

Zakład o prognozę musi mieć dwie strony. Koszty błędu gracza na 1 MWh:

```
niedobór:  kara 4 000 + utracona taryfa 650  =  4 650 zł/MWh
nadwyżka:  kara zrzutu                        =    400 zł/MWh
```

Optymalne pokrycie (model gazeciarza): kwantyl `4650 / (4650 + 400) ≈ 0,92` rozkładu
(popyt − OZE). Gracz powinien celować w ~92. percentyl pasma prognozy (~+1,4σ) —
rozsądny zapas, ale nie „zawsze maks". Kontrola skrajności: kara 0 → optimum przy
100. percentylu (gracz zawsze nadstawia do oporu, zakład znika); kara symetryczna
4 000 → optimum przy 54. percentylu (chroniczne blackouty). **400 zł/MWh** daje
asymetrię ~12:1 — blackout boli wielokrotnie mocniej niż zrzut, ale zrzut przestaje
być darmowy. Parametr do strojenia w dokumencie 03.

**Co zmienia objęcie OZE karą (0.8).** Wyliczenie powyżej dotyczy **nastawy sterowalnych**
przy danym `popyt − OZE` i zostaje w mocy: OZE jest w merit order pierwsze, więc krańcową
zrzucaną MWh jest niemal zawsze blok sterowalny, a asymetria 4650:400 nie drgnie. Kara za
OZE działa na **innej osi decyzyjnej** — nie na nastawie tury, lecz na rozmiarze floty OZE
wobec sieci i magazynów: opłaca się dokładać farmę tylko dopóty, dopóki jest ją czym
wyprowadzić i gdzie odłożyć. Do wystrojenia w dokumencie 03 wraz z resztą ekonomii.

Kara jest niższa od taryfy (650), więc nadwyżkę zawsze opłaca się zagospodarować:
ładowanie magazynu unika kary i przechowuje energię wartą taryfę; eksport daje 150
przychodu + unikniętą karę = efektywnie ~550 zł/MWh — eksport staje się realnym
zaworem bezpieczeństwa, zgodnie z intencją 01 §5.7.

## 6. Niedobór — alokacja emergentna

**DECYZJA (3): kto jest daleko, ten gaśnie.** Żadnej jawnej reguły podziału niedoboru
nie ma — alokacja wynika z rozpływu (§3): maksymalizacja energii dostarczonej przy
koszcie rosnącym z odległością sprawia, że miasta bliskie źródłom i miasta „w przelocie"
na trasie linii konsumują pierwsze, a niedobór kumuluje się w miastach dalekich,
za wąskimi gardłami lub za innymi miastami. Dotyczy obu przyczyn niedoboru:

- **sieciowej** (linia za cienka, przyłącze graniczne wyczerpane) — niedobór lokalny
  za wąskim gardłem,
- **systemowej** (za mało mocy w puli) — pula wyczerpuje się na bliskich odbiorach,
  niedobór spada na najdalsze miasta (straty dodatkowo pogłębiają efekt: dostawa
  daleko „kosztuje" pulę więcej na każdą dostarczoną MWh).

Rozliczenie: kara **4 000 zł/MWh** (01 §4.5), licznik energii niedostarczonej
**per miasto per tura** — to z niego 05 §6.1 liczy miesięczne `U` (wagi dób 10,9/10,9/8,7)
sterujące wzrostem i kurczeniem miast. UI: miasto w niedoborze gaśnie/miga (01 §8).

## 7. Integracja pogody i prognoz

- **DECYZJA (11): jedna prawda pogodowa dla kraju** — reżim miesięczny i przebiegi
  godzinowe (wiatr, zachmurzenie, temperatura) wg 06 §8, wspólne dla całej mapy; heks
  różnicuje tylko przełożenie na moc (klasa wiatru → parametry Weibulla, mnożnik
  nasłonecznienia — 01 §3.2). Sąsiedzi z własną pogodą — odłożeni (90 §6).
- **DECYZJA (10): błąd prognozy popytu jest systemowy** — jedno losowanie czynnika
  błędu na horyzont (06 §8.6.2, σ_popyt od sumarycznego szczytu przyłączonych miast),
  skalowane proporcjonalnie na miasta. Prognozy per miasto są więc w pełni skorelowane;
  dywersyfikacja geograficzna nie zmniejsza błędu popytu (wiatr/PV mają własne błędy).
- Prawda generowana w całości przy inicie doby (06 §8.6.1), kwantyzowana na granicy
  generacji; prognoza = prawda + szum wg 06 §8.6. Panel „bilans przy obecnych
  nastawach" (01 §8) liczy pokrycie z pasm prognozy przy zamrożonych nastawach.

## 8. Parametry uzupełniające (baseline dla dokumentów 03/04/07)

### 8.1 Mnożniki kosztu terenu (budowa linii i obiektów)

| Teren | Linie | Obiekty punktowe | Farma wiatrowa |
|---|---|---|---|
| nizina | ×1,0 | ×1,0 | ×1,0 |
| las | ×1,3 | ×1,3 | ×1,3 |
| wyżyna | ×1,5 | ×1,5 | ×1,5 |
| bagno | ×2,0 | ×2,0 | ×2,0 |
| teren zurbanizowany | ×2,0 | ×2,0 | ×2,0 |
| góry | ×2,5 | ×2,5 | ×2,5 |
| jezioro | **×2,5** | budowa niemożliwa | budowa niemożliwa |
| morze | **×3,5** | budowa niemożliwa | **×2,5** |

**DECYZJA (6):** linie mogą przechodzić przez wodę (kabel podwodny — drogo, bez stacji
pośrednich na wodzie). Szczytowo-pompowa tylko góry/wyżyna + woda (01 §3.2).

**DECYZJA (12, 0.7): morze przyjmuje farmę wiatrową i nic poza nią** (01 §3.2, §5.2
w 0.22). Kolumna „Farma wiatrowa" pokrywa się z kolumną obiektów wszędzie poza wodą —
istnieje wyłącznie po to, żeby morze mogło mieć własną cenę. Elektrownie, PV, magazyny,
stacje rozdzielcze i przyłącza graniczne na wodzie nadal nie stoją, a **jezioro nie
przyjmuje niczego**: w grze jest zbyt małe, a jego rolą jest woda dla szczytowo-pompowej.

**Dlaczego ×2,5, a nie ×3,5 od kabla.** Mnożnik ×3,5 strojono dla **linii** — kabla
podwodnego, nie fundamentu turbiny. Przeniesiony na obiekt dałby CAPEX 12,6 mln zł/MW,
czyli **93% więcej za roczną MWh** niż farma na nizinie (3 038 vs 1 577 zł), a mapa v1
oferuje 332 heksy lądowe wobec 47 morskich (§8.6) — przy braku deficytu miejsca nikt by
tego nie kupił i morze byłoby opcją martwą. ×2,5 daje 9,0 mln zł/MW, 2 170 zł za roczną
MWh (+38%) i **zwrot ~3,5 roku** przy taryfie 650 zł/MWh — między wiatrem lądowym (~2,7)
a flotą cieplną (węgiel 4,1 / CCGT 4,6 / jądrowa 5,1). Morze jest więc **premią za jakość
zasobu** (CF ~47%, płaska sezonowość, o ⅓ mniej godzin zerowych), nie tanią energią.
Koszt stały pozostaje lądowy — 130 tys. zł/MW/rok (§8.3): podwojenie przesuwa zwrot
o 0,18 roku, więc nie kupuje tyle, ile kosztuje w komplikacji. Knob do strojenia w doc 03.

### 8.2 Magazyny — CAPEX i moduły (uzupełnia 01 §5.3)

| Typ | CAPEX | Moduł rozbudowy | Limit na heks |
|---|---|---|---|
| **Bateria (BESS)** | moc: **1,6 mln zł/MW** · pojemność: **1,1 mln zł/MWh** (kupowane osobno) | dowolna kombinacja modułów mocy/pojemności | 500 MW / 2 000 MWh |
| **Szczytowo-pompowa** | blok **250 MW / 2 500 MWh** (10 h): **~1,1 mld zł** | +1 blok | 4 bloki (1000 MW / 10 000 MWh) |

Przykład: bateria 100 MW / 200 MWh = 160 + 220 = **380 mln zł**, budowa 1 doba gry.

### 8.3 Koszty stałe utrzymania (uzupełnia 01 §5–6)

| Obiekt | Koszt stały |
|---|---|
| Jądrowa | 500 tys. zł/MW/rok |
| Węgiel | 260 tys. zł/MW/rok |
| Gaz CCGT | 120 tys. zł/MW/rok |
| Gaz OCGT | 70 tys. zł/MW/rok |
| Wiatr (lądowy i morski — 0.7) | 130 tys. zł/MW/rok |
| PV | 50 tys. zł/MW/rok |
| Bateria | 40 tys. zł/MW/rok (od mocy) |
| Szczytowo-pompowa | 80 tys. zł/MW/rok |
| Linie | 1,5% CAPEX-u/rok (NN ~18 / SN ~37,5 / WN ~90 tys. zł/km/rok) |
| Stacja rozdzielcza (60 mln zł → 1,2 mln zł/rok), przyłącze graniczne | 2% CAPEX-u/rok |

Naliczanie dobowe: roczne / 365 × liczba reprezentowanych dni doby (01 §6).

### 8.4 Rozbudowa i limity lokalizacji (przygważdża widełki z 01 §7)

**DECYZJA (9):** rozbudowa = **70% czasu** i **85% CAPEX-u** nowej lokalizacji
(jednakowo dla wszystkich technologii). Limity: elektrownie sterowalne **6 bloków
na heks**; farmy OZE do limitu mocy heksa: **wiatr 300 MW na lądzie i 600 MW na morzu
(0.7), PV 200 MW**; magazyny wg tabel (§8.2). Stacji rozdzielczej nie rozbudowuje się
w ogóle (01 §5.4 w 0.21).

**Rozszerzenie (01 §5.2, §7 w 0.22): limit mocy heksa i czas budowy farmy wiatrowej są
funkcją terenu**, nie samej technologii.

| Teren farmy wiatrowej | Limit mocy heksa | Czas budowy | CAPEX pełnego heksa |
|---|---|---|---|
| ląd (dowolny zabudowywalny) | 300 MW | 1 doba gry | 1,08 mld zł (nizina) |
| **morze** | **600 MW** | **2 doby gry** | **5,4 mld zł** |

Rozbudowa liczy 85% CAPEX-u i 70% czasu **od terenu heksa, na którym farma stoi** — na
morzu dostawienie 300 MW to 85% z 2,7 mld zł i 70% z 2 dób. Konsekwencja projektowa
600 MW: pełna farma morska **nie mieści się w linii SN** (500 MW — 01 §4.2), więc wymusza
WN albo drugi tor. Wyprowadzenie mocy na ląd jest przez to osobną decyzją inwestycyjną,
a nie dodatkiem do farmy — i to ono, a nie sam CAPEX turbin, hamuje zabudowę morza.

**Rozszerzenie (01 §4.2 w 0.17): reguła obejmuje też linie.** Rozbudowa gotowej linii do
wyższego typu (NN→SN→WN, tylko w górę) kosztuje **85% CAPEX-u** i trwa **70% czasu** nowej
linii docelowego typu na tej samej trasie, licząc z mnożnikami terenu §8.1. Do chwili
ukończenia linia wchodzi do grafu ze **starym** typem: stara przepustowość i stary
współczynnik strat (§3), a koszt stały §8.3 również nalicza się od starego typu. Dla limitu
korytarza (01 §3.3) linia w rozbudowie zajmuje miejsce w obu licznikach — starego
i docelowego typu.

### 8.5 Kara bilansowa

Zrzut energii sterowalnej: **400 zł/MWh** (§5.2; parametr, strojenie w doc 03).

### 8.6 Mapa pierwszej wersji

**DECYZJA (5):** v1 gra na **jednej ręcznie zaprojektowanej mapie**: rozmiar mały
**24×16**, **8–12 miast** (1 przyłączone na start — 01 §3.4), 2–4 punkty graniczne,
co najmniej po jednej lokalizacji klasy wiatrowej dobrej/złej i jednej lokalizacji
szczytowo-pompowej. Mapa jest częścią danych scenariusza (razem z minimalnym stanem
posiadania i kapitałem). Generator proceduralny — dokument 07.

**Bilans heksów mapy v1 (0.7):** 384 heksy — **332 zabudowywalne lądowe** (272 otwarte,
26 nadmorskich, 34 osłonięte) i **47 morskich**, z czego 26 sąsiaduje z lądem, a 21 leży
dalej. Dwa poziomy trudności wychodzą więc z samej geografii, bez osobnej mechaniki:
farma przybrzeżna wymaga jednego heksa linii, farma na dalekim morzu — kabla przez heks
morski za ×3,5. Morze daje 28,2 GW mocy zainstalowanej wobec 99,6 GW na lądzie: to nie
jest zawór na brak miejsca, tylko lepszy zasób (§8.1).

## 9. Determinizm i testy akceptacyjne

Zasady ogólne: cała losowość z seedowanego PRNG (nazwane strumienie), pieniądze
w całkowitych złotych, prawda kwantyzowana na granicy generacji, stan JSON-owy.
Testy specyfikacyjne cytują sekcje tego dokumentu:

1. **§3.2** — determinizm: identyczny stan → identyczny rozpływ (hash wyniku),
   niezależnie od kolejności wstawiania obiektów do stanu.
2. **§3.1** — merit order: przy wolnej sieci źródła wykorzystywane w kolejności
   kosztu zmiennego (OZE/magazyn → jądrowa → węgiel → CCGT → OCGT → import).
3. **§3.3** — straty: trasa SN 8 heksów = 4%; dostarczenie 300 MW wymaga nadania
   312,5 MW (01 §4.2).
4. **§6** — najbliżsi pierwsi: dwa miasta na jednej linii za jednym źródłem, pula
   mniejsza od sumy poborów → miasto bliższe pokryte w całości, cały niedobór
   w dalszym.
5. **§6** — tap w przelocie: miasto mijane przez linię konsumuje przed odbiorami
   za nim.
6. **§2** — wąskie gardło korytarza: dwie linie SN po 500 MW zebrane w linię NN
   150 MW → przepływ ≤ 150 MW (01 §4.2). Ograniczenie węzłowe pozostaje wyłącznie
   na przyłączu granicznym (01 §5.7); stacja rozdzielcza nie ogranicza niczego.
7. **§4** — priorytety: przy ciasnej sieci ładowanie i eksport nie odbierają miastom
   ani MW (porównanie przebiegów).
8. **§5** — zrzut: kara od **sumy** zrzutu sterowalnych i przycięcia OZE (0.8); paliwo
   naliczone od wykorzystania; import od nastawy. Kontrola: farma odcięta od odbioru
   płaci co turę, farma wyłączona nie płaci nic.
9. **§5.2** — próba symulacyjna: strategia „zawsze maksymalne nastawy" jest droższa
   od strategii celującej w ~90. percentyl pasma (kara działa).
10. **§6** — suma energii niedostarczonej per miasto × wagi dób = `1 − U` z 05 §6.1
    (spójność z modelem wzrostu miast).
11. **§8.4** — rozbudowa linii (01 §4.2): koszt = 85% CAPEX-u typu docelowego na tej
    trasie, czas = 70% jego czasu budowy; do ostatniej tury robót rozpływ i koszt stały
    liczą się od **starego** typu, po ukończeniu od nowego; rozbudowa w dół, rozbudowa
    linii w budowie i druga rozbudowa tej samej linii są odrzucane; linia w rozbudowie
    zajmuje korytarz (⩽9/heks) w obu typach.
12. **§4.1** — archiwum: po `n` rozstrzygniętych turach archiwum ma `n` skrótów w kolejności
    kalendarza, bez luk; skrót tury `k` jest identyczny z tym, co pasek raportu pokazywał
    na żywo po turze `k`; suma `net` skrótów doby = `WYNIK DOBY`; suma warstw pokrycia =
    dostarczenie + straty; round-trip zapisu nie gubi ani jednego skrótu.
13. **§2** — przecięcie na obiekcie (01 §3.3): obiekt ukończony na trasie gotowej linii
    zostawia w stanie dwie linie kończące się w nim, o niezmienionej sumie długości
    i godzin; oba odcinki przewodzą, a każdy rozbudowuje się osobno. Heks, którego
    korytarz przyniósłby więcej końców niż obiekt ma przyłączy, odrzuca budowę.
14. **§8.1, §8.4** — wiatr morski (01 §3.2, §5.2 w 0.22): na heksie morskim farma wiatrowa
    przechodzi i kosztuje **2,5 × CAPEX bazowy**, a elektrownia, PV, magazyn, stacja
    rozdzielcza i przyłącze graniczne są odrzucane; na jeziorze odrzucana jest także
    farma wiatrowa. Limit heksa morskiego to 600 MW (lądowego 300), budowa trwa 2 doby
    (na lądzie 1), a rozbudowa liczy 85%/70% od terenu heksa farmy. Farma morska dostaje
    klasę wiatrową morską z danych mapy i wchodzi do rozpływu jak każde inne źródło OZE.

## 10. Pytania otwarte

1. **Strojenie kary bilansowej** (400 zł/MWh) i weryfikacja, czy import take-or-pay
   nie jest zbyt brutalny — dokument 03 / playtesty.
2. **Algorytm auto-trasy linii** („najtańsza trasa" z ręczną korektą, 01 §3.3) —
   A* po koszcie heksów z §8.1; szczegóły przy dokumencie 07 (mapa) lub implementacji UI.
3. **Zachłanność rozpływu**: czy przypadki, w których kolejne-najtańsze-ścieżki
   dostarczają mniej niż optimum, są w praktyce odczuwalne — obserwować na goldenach;
   ewentualna wymiana na pełny min-cost flow jest lokalna (kontrakt §3.1 bez zmian).
4. **Rozmiar archiwum w bardzo długiej kampanii** (§4.1): przy ~200 KB na rok gry zapis
   przekroczy megabajt po ~5 latach gry, a autozapis serializuje go co turę. Obserwować;
   furtką jest zgrubianie tur starszych niż rok do agregatów dobowych — bez zmiany
   kontraktu, bo wstęga i tak rysuje tylko okno widoczne.

## 11. Wpływ na inne dokumenty

- **01 §4.1** — zmiana: „nadwyżka sterowalna przycinana bez kary" → zrzut karany
  (§5); OZE bez zmian. Zaktualizowane w 01 v0.16.
- **01 §4.1, §5.2, §6** — zmiana (0.8): podstawą kary jest **cała** nadwyżka, OZE
  włącznie. Zaktualizowane w 01 v0.23.
- **01 §3.3, §5.2** — zmiana (0.8): linia może kończyć się na placu budowy, a obiekt
  ukończony bez linii startuje wyłączony. Zaktualizowane w 01 v0.23.
- **01 §3.2, §5.3, §6, §7** — zaktualizowane w 01 v0.16 wskazaniami na §8 (baseline;
  kanon parametrów przejmą dokumenty 03/04).
- **03 (ekonomia)** — strojenie: kara bilansowa, take-or-pay importu, koszty stałe,
  test „czy 10 mld domyka otwarcie".
- **04 (katalog)** — konsoliduje tabele 01 §5 + §8 tego dokumentu.
- **05 §6.1** — `U` liczone z liczników niedoboru per miasto z §6 (bez zmian w 05).
- **07 (mapa)** — generator proceduralny; do tego czasu obowiązuje ręczna mapa §8.6.
- **01 §2.4, §8 pkt 1–2, §2.5** — zaktualizowane w 01 v0.18: wstęga czasu, podgląd tur
  wstecz, mapa zawsze na turze ostatniej, horyzont kroczący. §4.1 tego dokumentu jest
  kontraktem silnika dla archiwum.
- **06 §8.6.3** — horyzont kroczący (`1 ≤ h ≤ 24·D`) i wymóg dostępności prawdy dla
  `Δdoba ≤ D`; zaktualizowane w 06 v0.7.
- **08 (interfejs)** — wstęga czasu jest pierwszym elementem ekranu, którego handoff
  wizualny nie opisuje: przewijanie, separatory dób i karta prognozy na pasku raportu
  wymagają projektu.
