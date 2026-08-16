# Notatka strojeniowa — wsad do dokumentu 03

Powstała w kamieniu M10 (`plan/M10-stabilizacja.md` §5). Odpowiada na pytania
prototypowe z 01 §12 i na pytania otwarte 02 §10, opierając się na rozegranych
i zasymulowanych przebiegach. **Nic tu nie jest zmianą w kodzie** — wszystkie
propozycje czekają na decyzję projektanta w dokumencie 03.

## Skąd te liczby

| Źródło | Co to jest |
|---|---|
| `tests/goldens/scenarios/portfolio-expansion.json` | pełny rok gry (36 dób, 288 tur) na mapie v1, portfel budowany od stanu startowego |
| `tests/goldens/scenarios/dunkelflaute-with-storage.json` | 9 dób: 2 miesiące przygotowań + zimowy wyż z magazynem i importem |
| `tests/goldens/scenarios/junction-bottleneck.json` | 6 dób z wąskim gardłem stacji rozdzielczej (02 §9.6) |
| `tests/goldens/scenarios/forecast-upgrade.json` | 9 dób w jednym reżimie, zakup systemu zaawansowanego w połowie |
| symulacje pomocnicze | rok gry × 3 ziarna × 3 strategie nastaw; 100 lat pogody dla epizodów Dunkelflaute |

Nastawy w goldenach pochodzą z jednej, spisanej reguły dyspozytorskiej: pokryj
`(popyt − OZE)` w ~92. percentylu pasma prognozy (+1,4σ, 02 §5.2) plus 4% na
straty, merit order od najtańszej jednostki, korekta nastawy dopiero gdy cel
przesunie się o >6% (min. 10 MW). Reguła jest celowo prosta — chodziło o to, by
liczby dało się przypisać mechanice, a nie sprytowi grającego.

## Pytania z 01 §12

### 1. Ile realnie trwa tura?

**Nie czas maszyny — czas decyzji.** Rozstrzygnięcie tury wraz z przerysowaniem
całego ekranu kosztuje ~10 ms (pomiar niżej), więc tempo gry ustala wyłącznie
gracz.

Rok gry według reguły dyspozytorskiej to **374 akcje na 288 tur, czyli ~1,3
zmiany nastawy na turę** — zwykle jedna elektrownia w merit order plus czasem
magazyn. Przy realistycznych 15–30 s na turę (odczyt prognozy i kolumny bilansu,
jedna korekta suwaka, klik) doba zajmuje 2–4 min, a **rok gry 1,2–2,4 h**.
Szacunek §2.5 (rok ≈ 2–2,5 h) potwierdza się, ale z zastrzeżeniem: dotyczy gry
w tempie „każda tura ręcznie".

Przewijanie miało to skracać i dziś **nie skraca**: reguły stopu z
`src/app/store/skip.ts` zatrzymałyby przewijanie w **171 z 288 tur** roku
goldenowego, z czego **160 to reguła prognozy** („prawda poza pasmem"). To nie
jest błąd implementacji, tylko progu: pasmo ma szerokość ±1σ dla każdej z trzech
wielkości (popyt, wiatr, PV), więc czysto statystycznie któraś wypada poza nie
w ~2 turach na 3. Reguła ostrzega o normie.

**Propozycja do 03/08:** oprzeć stop prognozy na **2σ** albo na wielkości
chybienia w MW (np. gdy chybienie przekracza rezerwę obrotową), a nie na samym
pasmie. Do tego samego wniosku prowadzi pytanie 4: tur wymagających decyzji jest
mało, ale przewijanie i tak nie pozwala ich pominąć.

### 2. Czy bilansowanie pod niepewną prognozą jest frajdą — czy gracz planuje na pasmach?

Zakład o prognozę **działa mechanicznie, ale jest tani**. Rok goldenowy:

| Pozycja | Rok gry |
|---|---|
| Przychód z energii | 1 199 mln zł |
| Paliwo | 469 mln zł |
| Koszty stałe | 162 mln zł |
| **Kara zrzutu** | **56,7 mln zł** (4,7% przychodu) |
| **Kara za niedobór** | **5,4 mln zł** (0,45% przychodu) |
| Wynik operacyjny | +507 mln zł |

Zrzut to średnio 16 MW na turę — dokładnie koszt marginesu +1,4σ. Niedobór
zdarzył się w 9 turach z 288. Czyli: **gracz trzymający się pasma płaci za to
~5% przychodu i praktycznie nie ryzykuje blackoutu**.

Porównanie strategii na roku gry (średnia z 3 ziaren, ten sam portfel):

| Strategia nastaw | Stan konta po roku | Zrzut [MW·tura] | Niedobór [MW·tura] |
|---|---|---|---|
| „zawsze maksimum" | 6,7 mld zł | 195 000 | 7 300 |
| prognoza + 1,4σ (92. percentyl) | **9,9 mld zł** | 3 500 | 11 400 |
| sama prognoza, bez marginesu | 9,9 mld zł | 1 300 | 11 900 |

Test akceptacyjny 02 §9.9 przechodzi z ogromnym zapasem: „zawsze maksimum" jest
**o ~3,1 mld zł rocznie gorsze**, i to niemal w całości karą zrzutu. Ale drugi
wynik jest ciekawszy: **między „prognoza + 1,4σ" a „sama prognoza" różnicy
praktycznie nie ma** (±0,2 mld, znak zależny od ziarna). Asymetria 11,6:1
z 02 §5.2 przewiduje wyraźną przewagę marginesu — w rozgrywce ginie ona
w szumie, bo (a) 4% zapasu na straty już jest marginesem, (b) część niedoborów
bierze się z ograniczeń sieci, których żaden margines nie usunie.

**Wniosek dla 03:** pasmo prognozy jest dziś **zabezpieczeniem, nie decyzją**.
Żeby planowanie na pasmach było realną grą, trzeba albo podnieść karę zrzutu
(wtedy margines zaczyna kosztować), albo — lepiej — zwiększyć zmienność OZE
względem mocy sterowalnej, żeby błąd prognozy przekładał się na MW, a nie na
promile. Rekomendacja: nie ruszać 400 zł/MWh dopóki nie sprawdzi się wariantu
z większym udziałem OZE (patrz doc 04).

### 3. Czy ograniczenia sieci są czytelne?

Golden `junction-bottleneck` to test tej czytelności: 250 MW stacja między
elektrowniami a Jasienicą, przy 490–630 MW zapotrzebowania i 900 MW mocy
w elektrowniach. Wynik 6 dób: **404 mln zł kary za niedobór przy 248 mln zł
przychodu** — sieć kosztuje więcej niż daje.

Co gracz widzi dziś:

- na mapie: segmenty linii kolorowane wykorzystaniem, ikona stacji, tooltip;
- w przewijaniu: reguła stopu „linia SN 96% przepustowości (X – Y)";
- w raporcie tury: niedobór per miasto.

Czego **nie** widzi: reguły stopu przewijania sprawdzają wyłącznie segmenty
linii (`src/app/store/skip.ts`, `overloadStop`) — **stacja rozdzielcza wysycona
w 100% nie generuje żadnego komunikatu**. Policzone na tym goldenie: 48 tur,
32 zatrzymania przewijania, z tego **29 to „niedobór", a przeciążenia linii
tylko 1** — bo linie SN stoją poniżej 90% przepustowości właśnie dlatego, że
stacja ich nie przepuszcza. Gracz dostaje więc „niedobór 324 MW w JASIENICA"
i musi sam dojść, że winna jest stacja, a nie brak mocy. Dobitniejsze jest zachowanie z doby 3: dobudowanie
500 MW elektrowni **nie zmienia dostarczenia ani o MW**, a nadmiarowe nastawy
zamieniają się w 230–343 MW zrzutu na turę.

**Propozycja do 03/08 (nie zaimplementowana):** dodać regułę stopu i etykietę
dla węzła — raport tury ma już `nodes[].usedMw/throughputMw`, więc to zmiana
w warstwie UI, nie w silniku.

### 4. Po ilu dobach pojawia się znużenie?

Subiektywnie, z rozegranych przebiegów: **znużenie zaczyna się tam, gdzie pogoda
przestaje zmieniać zdanie** — czyli w miesiącach o reżimie przejściowym, gdy
przez 3 doby (24 tury) jedyną czynnością jest przesunięcie nastawy węgla za
krzywą popytu. W roku goldenowym takich tur jest zdecydowana większość:
niedobór pojawił się w 11 turach z 288, a poza nim żadna tura nie postawiła
gracza przed wyborem innym niż „ile węgla".

Odwrotnie: doby, które trzymały uwagę, to te z konfliktem — Dunkelflaute
(magazyn pustoszeje, import kosztuje 800 zł/MWh), sztorm (600 MW wiatru,
potem odcięcie w jednym bloku), doba po przyłączeniu dużego miasta. Wszystkie
trzy są w goldenach i wszystkie trzy wynikają z pogody albo z decyzji gracza,
nie z „poziomu trudności".

**Wniosek dla 03/09:** nie skracać doby ani nie dodawać zdarzeń losowych
(90 §8 zostaje odłożone) — raczej dać przewijaniu więcej powodów do
zatrzymania (patrz pytanie 3) i przyspieszyć narastanie skali, żeby gracz
szybciej trafiał na doby z konfliktem.

## Obserwacje ekonomiczne

### Czy 10 mld zł domyka otwarcie? (01 §3.4)

**Nie domyka — jest wyraźnie za dużo.** Rok goldenowy: 6,0 mld zł nakładów
(elektrownia węglowa 300 MW + blok 200 MW, dwa korytarze SN, farma wiatrowa
100 MW, bateria 100 MW/400 MWh, dwa przyłączenia miast) i mimo to **4,5 mld zł
na koncie po roku**, przy wyniku operacyjnym +507 mln zł. Innymi słowy: cały
roczny przychód systemu (1,2 mld zł) to ~12% kapitału startowego, a pierwsza
fala rozbudowy zużywa 60% kapitału bez żadnego wyboru „albo–albo".

Ten sam efekt widać w pozostałych scenariuszach: 5,4 mld zł nakładów przy
portfelu OZE + magazyn + przyłącze graniczne, 3,6 mld zł przy elektrowni 500 MW
z korytarzem i stacją.

**Propozycja do 03** (do wyboru, nie kumulatywnie):

1. obniżyć kapitał startowy do **4–5 mld zł** — wtedy pierwszy rok to realny
   wybór między drugą jednostką a siecią do kolejnego miasta (01 §3.4 zapowiada
   właśnie taki wybór);
2. albo zostawić 10 mld i **podnieść CAPEX sieci** — dziś korytarz SN 7 heksów
   (437 mln zł) jest tani wobec elektrowni węglowej 300 MW (2,7 mld zł), więc
   „ciągnąć sieć" nigdy nie konkuruje z „budować moc";
3. albo wprowadzić koszt kapitału/kredyt (dziś pieniądz leżący na koncie nic
   nie kosztuje i nic nie przynosi).

### Czy kara zrzutu 400 zł/MWh działa? (02 §5.2)

**Działa jako bariera przed „zawsze maks", nie działa jako regulator marginesu.**
Dane w pytaniu 2: strategia maksymalnych nastaw traci ~3,1 mld zł rocznie
(195 tys. MW·tura zrzutu ≈ 2,4 mld zł kar), więc dolna skrajność z 02 §5.2 jest
skutecznie odcięta. Natomiast przy rozsądnej grze zrzut kosztuje 4,7% przychodu
i nie różnicuje strategii „z marginesem" i „bez marginesu".

**Propozycja do 03:** zostawić 400 zł/MWh do czasu, aż portfel OZE urośnie
(większa zmienność = większy margines = kara zaczyna wybierać strategię).
Przy okazji sprawdzić jedną asymetrię: **zrzut OZE jest darmowy** (02 §5.1),
więc portfel z dużym OZE płaci karę tylko za sterowalne — w scenariuszu
sztormowym gracz oddaje 200–430 MW wiatru na turę bez żadnego kosztu i bez
żadnej informacji zwrotnej poza brakiem przychodu.

### Czy import take-or-pay nie jest zbyt brutalny? (02 §10 pkt 1)

Mechanika jest w porządku, **ale kosztuje nie tam, gdzie się wydaje**.
W scenariuszu Dunkelflaute rachunek za import to 59,9 mln zł, z czego
**15,0 mln zł (25%) to moc zamówiona i niewykorzystana**. Rozkład winy:

- straty na trasie przyłącze → Modrzyca → Jasienica to ~5,5%, czyli mniejszość;
- reszta to **margines prognozy, który merit order posadził na imporcie** —
  import jest najdroższy, więc trafia na koniec kolejki i przejmuje cały zapas
  +1,4σ.

To jest realna pułapka projektowa: niewykorzystana nastawa elektrowni kosztuje
400 zł/MWh (kara zrzutu), a niewykorzystana nastawa importu 800 zł/MWh (pełna
cena) — **dokładnie 2× drożej**. Optymalna gra to trzymać margines na
elektrowniach i importować tylko oczekiwaną wartość, co jest sprzeczne
z naturalnym odruchem „zabezpiecz się na granicy".

**Propozycja do 03/08:** nie zmieniać ceny ani zasady take-or-pay; pokazać
skutek w UI (w raporcie tury: „import opłacony X MW, dostarczono Y MW") i
rozważyć opisanie tej zależności w 01 §5.7, bo dziś gracz odkrywa ją rachunkiem.

## Wydajność (M10 §4)

- **Silnik**: rok gry (288 tur) na mapie v1 z portfelem 18 obiektów —
  **38 ms** (mediana z 5 przebiegów, pierwszy „zimny" 57 ms), Node 22,
  MacBook Apple Silicon. Próg w teście `tests/unit/perf-year.test.ts` ustawiony
  na 300 ms; drugi test pilnuje kształtu (koszt miesiąca późnego vs wczesnego),
  bo to on wykrywa O(n²) niezależnie od maszyny.
- **Render mapy** (profil ręczny, dev server + Chrome, stan wczytany do
  autozapisu: 50 obiektów, 5 linii, 384 heksy, 1272 elementy SVG):

  | Interakcja | Czas od kliknięcia do zaktualizowanego DOM |
  |---|---|
  | pierwsza interakcja po wczytaniu | 82 ms (jedno long task 63–67 ms) |
  | zatwierdzenie tury (rozgrzane) | 8–17 ms |
  | przewinięcie całej doby (do 7 tur naraz) | 12–48 ms |
  | zaznaczenie heksa (przerysowanie mapy + panel) | 7–9 ms |

  Poza pierwszą interakcją **nie ma zadań dłuższych niż 50 ms**, więc jank nie
  występuje; pomiar jest pesymistyczny, bo wykonany na buildzie deweloperskim
  (React bez minifikacji, z kontrolami dev). Jedyne long task to pierwsze
  zbudowanie modelu sceny po wczytaniu strony — jeśli kiedykolwiek zacznie
  przeszkadzać, naturalnym krokiem jest memoizacja warstwy heksów, która nie
  zmienia się między turami.

## Czego ta notatka nie rozstrzyga

1. **Skala późnej gry.** Wszystkie przebiegi kończą się na 2–4 przyłączonych
   miastach i ~600 MW szczytu. Docelowe 20–30 GW (01 §3.4) nie było grane, więc
   nie wiadomo, czy ekonomia trzyma się przy 30× większym systemie.
2. **Wzrost miast.** W roku goldenowym miasta rosły o 12–30% (05 §6 działa), ale
   nie sprawdzono, czy logistyczne wysycenie faktycznie hamuje przy suficie —
   to pytanie na doc 05, wymaga symulacji wieloletniej z pełnym przyłączeniem.
3. **Systemy prognostyczne się nie zwracają.** Golden `forecast-upgrade`:
   system zaawansowany (600 mln zł) obniża kary o ~3,3 mln zł na 4 doby, czyli
   ~0,8 mln zł na dobę gry. Zwrot po ~700 dobach ≈ 20 latach gry. Przy systemie
   200 MW to zakup czysto stratny; sensu nabiera dopiero przy portfelu OZE
   liczonym w GW. Do decyzji w 03: obniżyć cenę, zwiększyć krok σ między
   poziomami, albo świadomie zostawić jako zakup „na późną grę".
4. **Czy Dunkelflaute jest odpowiednio częsty?** Test 06 §12.12 został w M10
   domknięty (dokument 0.5 → 0.6, definicja epizodu w kalendarzu gry), ale
   przeliczenie na kalendarz rzeczywisty daje **~47 dni warunków Dunkelflaute
   rocznie** — górna część tego, co sugerowało dawne pasmo „2–5 epizodów po
   3–10 dni". Sprawdzone: 4,56–4,98 doby gry rocznie na 6 ziarnach × 100 lat.
   Jeśli po strojeniu ekonomii okaże się, że zimowe wyże za mocno dominują rok,
   miejscem korekty są miesięczne wagi reżimów (06 §8.3), nie test.
