# ElectroNation — Dokument bazowy mechaniki gry

**Wersja:** 0.10 (dokument koncepcyjny)
**Data:** 2026-08-07
**Status:** obowiązuje **wersja uproszczona** gry; mechaniki odłożone czekają w [90-pomysly-na-przyszlosc.md](90-pomysly-na-przyszlosc.md)

**Zmiany 0.9 → 0.10:** **start z minimalnym stanem posiadania** zastępuje czysty greenfield
(§3.4) — gra zaczyna się z małym działającym systemem (elektrownia + stacje + linia + jedno
przyłączone miasto), darmowym i niezależnym od kapitału startowego. Wniosek z prototypu:
przy pustej mapie pierwsze pół roku gry nie zawierało żadnej decyzji dyspozytorskiej.
Reszta §3.4 (miasta niepodłączone, przyłączenie jako akt gracza) — bez zmian.

**Zmiany 0.8 → 0.9: rozstrzygnięto pytania otwarte.** Algorytm rozpływu: **min-cost flow**
(§4.4). Prototyp wprowadza pogodę **etapami** — najpierw astronomia + Weibull, reżimy
w drugim kroku (§12). **Import i eksport od startu** (§5.7). **Bez auto-nastaw** — wszystkie
nastawy ręczne (§8). Promień obsługi stacji **1 heks** potwierdzony (§3.3). **Brak twardego
stanu przegranej** (§9). **Kampania nieskończona** — bez wariantów długości (§2.7); w związku
z tym wzrost zapotrzebowania musi się długofalowo wysycać (nowe pytanie do dokumentu 05).
Otwarta pozostaje platforma docelowa.

**Zmiany 0.7 → 0.8: doprecyzowanie zakresu uproszczenia.** Uproszczony jest **sam przepływ
energii w sieci**: model „wodociągowy" (przepustowości linii + straty rosnące z długością,
bez praw Kirchhoffa, częstotliwości i rezerw — §4). Do wersji uproszczonej **wracają**:
**OZE (PV i wiatr lądowy)** wraz z pogodą — [dokument 06](06-model-astronomiczny-i-pogodowy.md)
znów obowiązuje w całości; **prognozy pogody i zapotrzebowania z błędem** (§2.4, model:
06 §8.6); **stacje elektroenergetyczne** w prostej formie: węzeł sieci z przepustowością
(§4.3, §5.4). Magazyny były w wersji uproszczonej od początku. Handoff UI
(`design_handoff_electronation_turn_ui/`) zostaje sklasyfikowany jako **wskazówka wyłącznie
wizualna** — zakres funkcjonalny gry wynika z tego dokumentu (§8). Dokument 90 odchudzony
i przenumerowany.

**Zmiany 0.6 → 0.7: WIELKIE UPROSZCZENIE.** Gra zredukowana do minimalnej grywalnej pętli:
znane zapotrzebowanie pokrywane z elektrowni, magazynów i importu; linie z przepustowością
i stratami od długości. Złożone mechaniki przeniesione do dokumentu 90. *(Zakres uproszczenia
skorygowany w 0.8 — patrz wyżej.)*
**Zmiany 0.5 → 0.6:** rozstrzygnięto: skala systemu (~1 GW → 20–30 GW), waluta (złoty),
przelicznik 25 km/heks, kapitał startowy 10 mld zł.
**Zmiany 0.4 → 0.5:** czasy budowy skrócone ponownie o połowę (K ≈ 5, jądrowa = 2 lata),
wzrost zapotrzebowania ~10%/rok; dodano rozbudowę istniejących obiektów.
**Zmiany 0.3 → 0.4:** gra jest turowa — 24 tury po godzinie; napięcie z niepewności prognozy;
przewijanie tur.
**Zmiany 0.2 → 0.3:** model elektryczny DC power flow *(w 0.7 zawieszony)*; start greenfield.
**Zmiany 0.1 → 0.2:** model „3 doby reprezentatywne na miesiąc"; skrócone czasy budowy
z zasadą zachowania proporcji.

---

## 1. Wizja

Gracz wciela się w rolę operatora systemu elektroenergetycznego w fikcyjnym kraju: buduje
elektrownie, farmy OZE, magazyny, stacje i linie, przyłącza miasta i dba o to, żeby
**w każdej godzinie** zapotrzebowanie na moc było pokryte. Zarabia na sprzedanej energii,
płaci za paliwo, infrastrukturę i każdą niedostarczoną megawatogodzinę.

Sednem gry są trzy proste, fizycznie umocowane ograniczenia:

1. **Bilans musi się domykać co godzinę** — energię trzeba wyprodukować (albo wyjąć
   z magazynu, albo kupić za granicą) dokładnie wtedy, kiedy jest potrzebna.
2. **Sieć nie jest przezroczysta** — działa jak sieć wodociągowa: rura (linia) ma maksymalny
   przepływ, a im dłuższa, tym więcej po drodze ginie. Moc „na papierze" to nie to samo
   co moc dostarczona do miasta.
3. **Pogody nikt nie zna na pewno** — produkcja wiatru i słońca oraz dokładne zapotrzebowanie
   znane są tylko jako **prognoza z błędem**. Gracz planuje w niepewności i płaci za pomyłki.

Motto: *Energii nie da się magazynować w kablu.*

**Zasada projektowa wersji uproszczonej:** najpierw ma być **grą** — symulatorem stanie się
później. Uproszczony jest silnik przepływu (rury zamiast praw Kirchhoffa); reszta złożoności
(fizyka rozpływów, częstotliwość, rynek energii, unit commitment) wraca pojedynczo, świadomymi
decyzjami — katalog czeka w [90-pomysly-na-przyszlosc.md](90-pomysly-na-przyszlosc.md).

---

## 2. Czas i pętla rozgrywki

Dwie przeplatające się pętle: **taktyczna** (rozegraj dobę, tura po turze) i **strategiczna**
(inwestuj, buduj, przyłączaj — w horyzoncie miesięcy i lat).

### 2.1 Skala czasu — model „3 dób reprezentatywnych"

30 lat rozgrywki to ~11 000 dób — nie da się zagrać wszystkich, a automat odebrałby graczowi
to, co najciekawsze. **Miesiąc składa się z 3 grywalnych dób reprezentatywnych:**

| Doba | Reprezentuje | Charakter |
|---|---|---|
| **Robocza A** | ~10,9 dnia roboczego | pełny profil: dolina nocna, szczyt poranny i wieczorny |
| **Robocza B** | ~10,9 dnia roboczego | jw., ale **inna pogoda** |
| **Wolna** | ~8,7 dnia weekendowego/świątecznego | niższe, bardziej płaskie zapotrzebowanie |

*(miesiąc ma średnio 30,4 dnia: ~21,7 roboczych i ~8,7 wolnych; rok gry = 36 dób)*

Cykl 12 miesięcy × 3 doby oddaje **sezonowość** — i to podwójnie: zapotrzebowanie (zima
wyższa, §5.6) oraz pogodę (wiatr najmocniejszy zimą, słońce latem — 06 §6.4, §3.7).
Styczniowa doba jest realnie inna od lipcowej.

**Skalowanie finansów:** wynik doby mnożymy przez liczbę reprezentowanych dni — robocza
×10,9, wolna ×8,7. Dotyczy przychodów, kosztów paliwa i importu. Efekt uboczny, który jest
zaletą: jeden zły dzień kosztuje jak jedenaście — stawka każdej decyzji rośnie.

**Pogoda jest losowana na poziomie miesiąca** (reżim dominujący obejmuje wszystkie 3 doby —
06 §8.4), dzięki czemu zjawiska wielodniowe, jak Dunkelflaute, są przeżywane jako narastający
kryzys, a nie pojedynczy zły dzień.

### 2.2 Rozgrywka turowa — doba to 24 tury po godzinie

**DECYZJA (bez zmian): gra jest turowa.**

```
1 tura  = 1 godzina czasu gry
1 doba  = 24 tury
```

Każda tura wymaga zatwierdzenia — nie ma czasu rzeczywistego ani pauzy. Nocne tury bez
decyzji zatwierdza się szybko albo przewija (§2.5). Turowość jest spójna z warstwą
strategiczną i uczciwa wobec danych — profile zapotrzebowania są natywnie godzinowe.

### 2.3 Struktura tury

```
┌────────────────────────────────────────────────────────────┐
│  FAZA 1 — PROGNOZA        (automatyczna)                   │
│  Gra pokazuje prognozę na najbliższe godziny, Z BŁĘDEM.    │
│  Wraz z horyzontem pasmo niepewności się rozszerza.        │
├────────────────────────────────────────────────────────────┤
│  FAZA 2 — DECYZJA         (gracz, bez limitu czasu)        │
│  Nastawy elektrowni, magazyny (ładuj/oddawaj),             │
│  import/eksport, ewentualne przycięcie OZE.                │
├────────────────────────────────────────────────────────────┤
│  FAZA 3 — ROZSTRZYGNIĘCIE (automatyczne, animowane)        │
│  Ujawnia się prawdziwa pogoda i zapotrzebowanie.           │
│  Silnik wyznacza przepływy: co dopłynęło do miast, ile     │
│  zjadły straty, gdzie zabrakło przepustowości lub mocy.    │
├────────────────────────────────────────────────────────────┤
│  FAZA 4 — RAPORT                                           │
│  Wynik finansowy tury, energia niedostarczona, kary.       │
│  Ile kosztowała pomyłka prognozy.                          │
└────────────────────────────────────────────────────────────┘
```

Faza rozstrzygnięcia ma być **pokazana, nie tylko podliczona**: przepływy na mapie, linie
zmieniające kolor z obciążeniem, miasto w niedoborze gasnące na oczach gracza. Dramat polega
na tym, że gracz **patrzy, jak rozstrzyga się jego zakład z prognozą**. Jeśli ta faza będzie
tylko odświeżeniem liczb, mechanika umrze.

### 2.4 Prognoza z błędem — źródło napięcia

Gracz **nie widzi stanu bieżącego pogody ani prawdziwego zapotrzebowania** — widzi prognozę,
która się myli, z błędem rosnącym z horyzontem. Model źródłowy: **06 §8.6** (tam wzory σ
i architektura); wartości orientacyjne:

| Horyzont | Wiatr | PV | Zapotrzebowanie |
|---|---|---|---|
| +1 h | ±6,2% mocy zainst. | ±5,0% | ±1,4% |
| +3 h | ±10,6% | ±9,0% | ±2,2% |
| +6 h | ±17,2% | ±15,0% | ±3,4% |
| +12 h | ±30,4% | ±27,0% | ±5,8% |

Własności, które są sednem mechaniki:

1. **Zapotrzebowanie jest niemal pewne, pogoda nie.** Gracz może ufać prognozie popytu
   i musi zabezpieczać się przed prognozą wiatru — zgodnie z rzeczywistością.
2. **Prognoza godzinowa jest dokładna — trudne są decyzje wielogodzinne.** W wersji
   uproszczonej (bez czasów rozruchu) dotyczy to głównie **gospodarki magazynem** („ile
   zostawić na wieczorny szczyt, skoro prognoza wiatru na 19:00 ma pasmo ±120 MW?")
   i utrzymywania zapasu mocy sterowalnej. Pełna głębia (rozruchy bloków = unit commitment)
   wraca później — 90 §3.
3. **Trudność bierze się z wariancji, nie z poziomu.** Przewidywalny niedobór jest łatwiejszy
   od nieprzewidywalnej obfitości (obserwacja z pierwszego prototypu — 90 §1.8).
4. **Prawda jest generowana w całości przy inicjalizacji doby**, prognoza jest jej zaszumionym
   widokiem (06 §8.6.1). Doba jest przez to **odtwarzalna z ziarna losowego** — wymóg
   architektoniczny silnika.

**Dokładność prognozy jest kupowalna** (inwestycje w systemy prognostyczne — mnożniki σ,
06 §8.6.3): rzadki przypadek inwestycji, która nie dodaje ani megawata, a obniża koszty.
Prognoza jest prezentowana jako **pasmo, nie liczba** (06 §8.6.4).

### 2.5 Przewijanie tur

Gracz steruje przewijaniem sam:

- „przewiń do godziny X",
- „przewiń, aż coś się stanie" — zatrzymanie przy niedoborze, przeciążeniu linii powyżej
  progu, odchyleniu od prognozy albo zmianie bilansu przekraczającej zadany próg.

W przewijanych turach nastawy pozostają bez zmian — przewijanie to świadome przyjęcie ryzyka,
nie darmowe pominięcie. Tempo gry z przewijaniem: **rok gry ≈ 2–2,5 h przy stole**.

### 2.6 Czasy budowy — zasada zachowania proporcji (K ≈ 5)

Napięcie strategiczne tworzy nie bezwzględny czas budowy, lecz **stosunek czasu budowy do
horyzontu, w którym zapotrzebowanie istotnie urośnie**. Czasy budowy są skrócone ~5× względem
rzeczywistości, a w zamian roczny wzrost zapotrzebowania podniesiony do **~10%/rok**:

> Realnie: jądrowa 10 lat przy wzroście 2%/rok → na starcie bloku popyt +22%.
> W grze: jądrowa 2 lata przy 10%/rok → +21%. Ten sam zakład, przeżyty 5× szybciej.

Czasy budowy obiektów — w §5 przy katalogach. Rozpoczętej budowy nie da się bezkosztowo
porzucić (anulowanie = utrata poniesionych nakładów).

### 2.7 Kampania bez końca

**DECYZJA: kampania jest nieskończona** — piaskownica bez zadanego horyzontu. Gracz kończy,
kiedy chce, albo gdy uzna cele z §9 za osiągnięte. Nie ma wariantów długości.

Konsekwencja do rozwiązania w dokumencie 05: przy wzroście ~10%/rok liczby rosną wykładniczo
(30 lat → ×17), więc **wzrost musi się długofalowo wysycać** — mapa ma skończoną liczbę
miast, a miasto skończoną pojemność; sufit wyznacza skala docelowa 20–30 GW (§3.4).

Auto-dyspozycja powtarzalnych dób jako zawór bezpieczeństwa — odłożona (90 §11).
Scenariusze z ustalonym horyzontem i celami — 90 §11.

---

## 3. Świat gry — mapa heksagonalna

### 3.1 Struktura

- Siatka heksagonalna o konfigurowalnym rozmiarze (`24×16` mała, `48×32` średnia, `96×64` duża).
- Orientacja **flat-top**, współrzędne **osiowe (axial q,r)**.
- **DECYZJA (bez zmian):** jeden heks = **25×25 km** (parametr mapy). Przelicznik wprost
  przekłada się na koszt budowy i straty linii.

### 3.2 Właściwości heksa

| Cecha | Wpływ na rozgrywkę |
|---|---|
| **Typ terenu** (nizina, wyżyna, góry, las, bagno, jezioro, morze, teren zurbanizowany) | mnożnik kosztu budowy linii i obiektów |
| **Potencjał wiatru** (klasa lokalizacji → parametry Weibulla, 06 §6.1) | produktywność farm wiatrowych |
| **Nasłonecznienie** (mnożnik regionalny) | produktywność PV |
| **Góry/wyżyna + woda** | jedyne miejsca pod elektrownię szczytowo-pompową (§5.3) |
| **Zawartość** | miasto, elektrownia, farma OZE, magazyn, stacja, punkt graniczny |

*(Odłożone właściwości: cieki wodne i chłodzenie bloków, złoża paliw, ograniczenia terenowe
typu park narodowy — 90 §2.)*

### 3.3 Obiekty i topologia sieci

- **Punktowe** (zajmują heks): elektrownie, farmy OZE, magazyny, **stacje elektroenergetyczne**,
  miasta, punkty graniczne (krawędź mapy).
- **Liniowe**: linie przesyłowe biegnące łańcuchem heksów. Koszt = długość trasy × koszt/km
  typu linii × mnożniki terenu. Trasuje gracz albo automat („najtańsza trasa") z ręczną korektą.

**Zasada topologii (wersja uproszczona):**

```
[elektrownia/OZE/magazyn/miasto] ──przyłącze── [STACJA] ══linia══ [STACJA] ──przyłącze── [...]
```

- **Linie biegną między stacjami** (punkt graniczny ma stację wbudowaną w przyłącze graniczne).
- **Obiekty przyłączają się do stacji** znajdującej się na tym samym heksie lub sąsiednim —
  **DECYZJA: promień obsługi stacji = 1 heks** (przyłącze lokalne wliczone w koszt obiektu).
  Dalej = potrzebna kolejna stacja i linia.
- Stacja jest **węzłem sieci** z własną przepustowością — szczegóły w §4.3 i §5.4.

### 3.4 Stan początkowy — minimalny stan posiadania

**DECYZJA (0.10, zastępuje czysty greenfield z 0.3): gracz zawsze zaczyna z minimalnym
stanem posiadania** — od pierwszej tury na mapie działa mały system: **jedna elektrownia
średniej wielkości (np. CCGT ~400 MW), stacje, linia i jedno przyłączone małe miasto**.
Stan startowy jest darmowy (nie pomniejsza kapitału startowego) i należy do definicji
scenariusza — scenariusze mogą go różnicować.

**Powód zmiany (wniosek z prototypu):** przy pustej mapie pierwsze ~pół roku gry nie
zawierało ani jednej decyzji dyspozytorskiej — gracz wyłącznie przewijał czas, czekając na
pierwszą budowę. Start z działającym zalążkiem uruchamia pełną pętlę tury (prognoza →
nastawy → rozstrzygnięcie → przychód) od pierwszej minuty, a mapa i tak pozostaje niemal
pusta — do zbudowania.

**Pozostałe miasta istnieją, ale startują jako niepodłączone:**

- Miasto niepodłączone nie generuje przychodu i nie wlicza się do bilansu — nie jest karą,
  po prostu jeszcze nie jest klientem.
- **Przyłączenie to akt gracza**: postaw stację przy mieście, doprowadź linię, załącz.
  Od tej chwili miasto płaci za energię, ale też **trwale dokłada swoje zapotrzebowanie** —
  odłączyć się nie da.
- Pierwsza decyzja strategiczna: **rozbudować zalążek** (druga jednostka, magazyn), czy
  **ciągnąć sieć** do kolejnego miasta.

Minimalny start pełni rolę samouczka: na początku to jedna elektrownia i jedno miasto,
złożoność narasta w tempie, w jakim gracz sam ją buduje. **Krzywa trudności jest emergentna.**

**DECYZJA (bez zmian): kapitał startowy = 10 mld zł** (parametr scenariusza). Przy starcie
z zalążkiem kapitał w całości finansuje pierwszą falę rozbudowy; czy nie jest wtedy zbyt
komfortowy — do weryfikacji w dokumencie 03.

**DECYZJA (bez zmian): skala systemu wynika z przyłączonych miast** — od ~1 GW szczytu
w pierwszych latach do **20–30 GW** w późnej grze (wzrost ~10%/rok + kolejne przyłączenia).

---

## 4. Rdzeń mechaniki — bilans godzinowy i przepływ „wodociągowy"

To jest serce wersji uproszczonej. Wszystko inne jest wokół tego zbudowane.

### 4.1 Równanie tury

W każdej turze suma zapotrzebowania przyłączonych miast musi zostać pokryta:

```
POKRYCIE:  produkcja sterowalna + produkcja OZE (z pogody) + rozładowanie magazynów + import
ZUŻYCIE:   zapotrzebowanie miast + ładowanie magazynów + eksport + straty przesyłowe
```

> **Przykład.** Tura 18:00 w listopadzie, zapotrzebowanie trzech miast łącznie **1500 MW**.
> Prognoza wiatru: 320 MW ±60. Gracz nastawia: węgiel 800 MW, gaz 250 MW, rozładowanie
> magazynu 100 MW, import 100 MW — razem ze spodziewanym wiatrem ~1570 MW na pokrycie
> 1500 MW plus ~45 MW strat. Rozstrzygnięcie: wiatr wchodzi 280 MW (dolna część pasma),
> PV = 0 (po zachodzie). Dostarczone: 1485 MW → **15 MW niedoboru** w najdalszym mieście.
> Raport: kara + notatka, że zabrakło zapasu na dolne pasmo prognozy.

- **Produkcja OZE jest niesterowalna** — wynika z pogody. Można ją tylko **przyciąć**
  (curtailment, bez kary — tracona jest darmowa energia).
- **Nadwyżka** produkcji sterowalnej jest przycinana automatycznie u źródła.
- **Niedobór** — patrz §4.5.

### 4.2 Linie: przepustowość i straty

Analogia obowiązująca w całym silniku: **sieć działa jak wodociąg**. Linia to rura —
ma maksymalny przepływ i gubi część tego, co płynie, proporcjonalnie do długości:

```
moc_odebrana = moc_nadana × (1 − k_strat · długość_km / 100)
```

| Typ linii | Maks. przesył | Straty k_strat | Koszt budowy | Czas budowy |
|---|---|---|---|---|
| **Lokalna (110 kV)** | 150 MW | 4% / 100 km | ~2 mln zł/km | 3 mies. |
| **Przesyłowa (220 kV)** | 500 MW | 2% / 100 km | ~4 mln zł/km | 6 mies. |
| **Magistrala (400 kV)** | 1500 MW | 1% / 100 km | ~7 mln zł/km | 9 mies. |

*(wartości orientacyjne, do strojenia w dokumencie 04; długość = liczba heksów trasy × 25 km;
nazwy napięć są kosmetyczne — logiki poziomów napięć w wersji uproszczonej nie ma)*

Wynikające z tego decyzje gracza:

- **Elektrownia blisko miasta** = tania linia i małe straty, ale drogi teren. **Elektrownia
  daleko** (tani teren, dobry wiatr) = straty zjadają marżę co godzinę.
- **Cienka linia jest tańsza dziś, ale za rok szczyt urośnie o 10%** i korytarz się zatka.
- Przykład skali strat: trasa 220 kV o długości 8 heksów (200 km) traci **4% przesyłanej
  mocy**. Żeby dostarczyć 300 MW, trzeba nadać 312,5 MW — różnicę gracz opłaca co godzinę.

### 4.3 Stacje: węzły z przepustowością

Stacja to trójnik/rozdzielacz w wodociągu — spina linie i obsługuje obiekty w promieniu
1 heksa. Ma **własną przepustowość [MW]** (moc transformatorów): suma mocy przepływającej
przez stację nie może jej przekroczyć.

Klasyczna pułapka projektowa, którą ta jedna liczba tworzy: **gruba linia, cienka stacja** —
gracz buduje magistralę 1500 MW, a wąskim gardłem zostaje stacja 250 MW na jej końcu.
Parametry i rozbudowa — §5.4. *(Układy rozdzielni, kompensacja, poziomy napięć — 90 §4.)*

### 4.4 Model przepływu — transportowy, nie fizyczny

Silnik traktuje sieć jako **graf przepustowości** (stacje = węzły, linie = krawędzie ze
stratami): znajduje najtańszy wykonalny rozpływ od źródeł do odbiorów, zamiast liczyć fizyczny
rozpływ prądu. Gracz nie steruje trasami bezpośrednio — ustawia źródła, a energia „płynie
sama" najtańszymi dostępnymi drogami, jak woda pod ciśnieniem.

**DECYZJA: algorytm rozpływu = min-cost flow.** Koszt krawędzi odzwierciedla straty (i koszt
energii u źródła), wynik jest deterministyczny i powtarzalny przy identycznym stanie sieci.
Formalizacja (reprezentacja grafu, funkcja kosztu, obsługa strat) — dokument 02.

Kluczowa własność pierwotnej wizji przeżywa uproszczenie w łagodniejszej formie: **można mieć
dość mocy i mimo to nie dostarczyć jej tam, gdzie trzeba** — bo korytarz albo stacja mają
za małą przepustowość, albo straty na długiej trasie zjadają nadwyżkę. Planowanie sieci
pozostaje grą samą w sobie, tylko bez praw Kirchhoffa.

*(DC power flow — przepływy kołowe i przeciążenia wynikające z fizyki — wraca jako poziom
„Standard": 90 §1.)*

### 4.5 Niedobór — energia niedostarczona

Jeśli pokrycie (po stratach i limitach sieci) nie wystarcza, brakująca energia staje się
**energią niedostarczoną** w konkretnych miastach:

- kara finansowa za każdą MWh niedostarczoną (rząd wielkości **10 000 zł/MWh** — wielokrotnie
  drożej niż jakakolwiek produkcja; parametr do strojenia),
- licznik energii niedostarczonej w statystykach doby i roku (miara jakości gry gracza).

Niedobór nie kończy gry — rujnuje wynik finansowy i ma być **widowiskowo zawstydzający**
(miasto gaśnie na mapie). Kaskady, SCO i blackout systemowy wracają z pełnym modelem
elektrycznym (90 §1.7).

---

## 5. Obiekty

### 5.1 Elektrownie sterowalne

W wersji uproszczonej elektrownia ma tylko: **moc maksymalną [MW]**, **koszt zmienny
[zł/MWh]**, **koszt stały [zł/MW/rok]**, **CAPEX** i **czas budowy**. Nastawę mocy można
zmieniać co turę w pełnym zakresie 0–100%. *(Minima techniczne, rozruchy, rampy,
dyspozycyjność, emisje — 90 §3.)*

| Technologia | Typowy blok | CAPEX | Czas budowy | Koszt zmienny | Rola |
|---|---|---|---|---|---|
| **Jądrowa** | 1000–1600 MW | ~35 mln zł/MW | 2 lata | ~60 zł/MWh | tania podstawa, wielki próg wejścia |
| **Węgiel** | 200–1000 MW | ~15 mln zł/MW | 1 rok | ~250 zł/MWh | podstawa |
| **Gaz CCGT** | 100–500 MW | ~9 mln zł/MW | 6 mies. | ~350 zł/MWh | elastyczne wypełnienie |
| **Gaz OCGT** | 25–150 MW | ~5 mln zł/MW | 3 mies. | ~600 zł/MWh | szczyt, mały i szybki w budowie |

*(wartości orientacyjne, do strojenia w dokumentach 03–04; wodna przepływowa i biomasa —
90 §2)*

### 5.2 OZE — wiatr i słońce

Źródła pogodozależne: **koszt zmienny ~0**, produkcja **niesterowalna** — wynika z pogody
wyznaczanej przez [dokument 06](06-model-astronomiczny-i-pogodowy.md) (krzywa mocy turbiny:
06 §6.3, produkcja PV: 06 §5, reżimy pogodowe: 06 §8). Można je tylko przycinać (§4.1).

| Technologia | Typowa farma | CAPEX | Czas budowy | Roczny CF (kontrola: 06 §12) | Charakter |
|---|---|---|---|---|---|
| **Wiatr lądowy** | 50–300 MW | ~6 mln zł/MW | 3 mies. | ~24–30% (zależnie od heksa) | najmocniej wieje zimą; **wyłączenie sztormowe przy 25 m/s** |
| **PV** | 10–200 MW | ~3 mln zł/MW | 1–1,5 mies. | ~11–12% | szczyt w letnie południe, **zero w nocy**; grudzień = ~8–10% czerwca |

Dwa wpisane w fizykę zjawiska, które są rdzeniem trudności (nie wymagają osobnych mechanik
„zdarzeń" — wynikają z reżimów pogodowych 06 §8.2):

- **Dunkelflaute** — zimowy wyż: wiatr ~0, PV śladowe, zapotrzebowanie na maksimum, przez
  kilka dób z rzędu (reżim miesięczny, §2.1). Test, dla którego istnieją magazyny, szczyt
  gazowy i import.
- **Sztorm** — najpierw nadprodukcja wiatru, potem kaskadowe wyłączenia turbin przy 25 m/s.

Tanie MWh z OZE są kuszące (koszt zmienny ~0 przy taryfie ~450 zł/MWh), ale niepewne
i wymagają zabezpieczenia mocą sterowalną, magazynem lub importem — to jest właściwa decyzja
portfelowa gry. *(Wiatr morski — 90 §2.)*

### 5.3 Magazyny energii

Magazyn rozdziela dwa parametry, które gracz musi rozumieć osobno: **moc [MW]** (jak szybko
oddaje/pobiera) i **pojemność [MWh]** (ile mieści). Bateria 100 MW / 200 MWh oddaje pełną
moc przez 2 godziny. UI musi to wyraźnie pokazywać.

| Typ | Sprawność cyklu | Typowy stosunek pojemność:moc | Budowa | Wymagania terenu |
|---|---|---|---|---|
| **Bateria (BESS)** | ~90% | 1–4 h | 1–1,5 mies. | brak — wszędzie |
| **Szczytowo-pompowa** | ~75% | 6–20 h | 1 rok | góry/wyżyna + woda (§3.2) |

Moc i pojemność baterii rozbudowuje się **osobno** (moduły). Zastosowania w wersji
uproszczonej: przenoszenie taniej energii (nocna jądrowa/węgiel, nadwyżki wiatru) na szczyt
oraz **bufor na błąd prognozy** — magazyn z zapasem energii to polisa na dolne pasmo wiatru.

### 5.4 Stacje elektroenergetyczne

Rola w topologii — §3.3, mechanika węzła — §4.3. Parametry (orientacyjne, do strojenia):

| Parametr | Wartość startowa | Rozbudowa | Limit lokalizacji |
|---|---|---|---|
| **Przepustowość (transformatory)** | 250 MW | +250 MW za moduł | 6 modułów (1500 MW) |
| **Pola liniowe** (ile linii można wpiąć) | 4 | +2 pola za moduł | 12 pól |
| CAPEX / czas budowy | ~200 mln zł, 3 mies. | moduł: ~120 mln zł, 1,5 mies. | — |

Zasięg obsługi: obiekty na heksie stacji i 6 sąsiednich (§3.3). *(Układy rozdzielni,
kompensacja mocy biernej, telemechanika, transformacja między poziomami napięć — 90 §4.)*

### 5.5 Linie przesyłowe

Katalog i mechanika — §4.2. Drugi tor na tej samej trasie = osobna linia (można dobudować).

### 5.6 Miasta

Miasto ma **klasę wielkości** (szczyt zapotrzebowania: małe ~50–150 MW, średnie ~150–500 MW,
duże ~500–1500 MW) i **jeden zagregowany profil dobowy**:

- **Doba robocza:** dolina nocna ~55–65% szczytu, garb poranny ~85–90% (8:00–12:00),
  szczyt wieczorny 100% (17:00–21:00).
- **Doba wolna:** profil bardziej płaski, szczyt ~80% szczytu doby roboczej.
- **Sezonowość:** mnożnik miesięczny od ~0,85 (maj) do ~1,15 (styczeń); dodatkowo reżim
  pogodowy modyfikuje popyt (mróz podnosi — 06 §8.2, §9).
- **Wzrost:** ~10%/rok (§2.6) + skokowe przyrosty przy przyłączaniu kolejnych miast.
- Prawdziwe zapotrzebowanie tury ≠ prognoza (§2.4) — błąd σ_popyt wg 06 §8.6.2.

Dokładne profile godzinowe i model wzrostu miast — dokument 05. *(Segmenty odbiorców,
DSR, prosumenci — 90 §9.)*

### 5.7 Punkty graniczne — import i eksport

Na krawędziach mapy leżą **punkty graniczne**. Żeby handlować, gracz buduje **przyłącze
graniczne** (interkonektor, z wbudowaną stacją) i dociąga do niego linię:

| Parametr | Wartość orientacyjna |
|---|---|
| CAPEX przyłącza | ~1,5 mld zł za 500 MW zdolności (rozbudowywalne) |
| Czas budowy | 9 mies. |
| **Cena importu** | ~800 zł/MWh — drożej niż każda własna produkcja |
| **Cena eksportu** | ~150 zł/MWh — mniej niż koszt zmienny gazu |

**DECYZJA: import i eksport są dostępne od startu** — oba kierunki działają od chwili
zbudowania przyłącza granicznego.

Ceny są w wersji uproszczonej **stałe** i ustawione tak, żeby import był kołem ratunkowym,
a nie strategią, zaś eksport — drobnym bonusem za nadwyżki (np. sztormowy wiatr), nie maszynką
do pieniędzy. *(Sąsiedzi z własnymi profilami cen, NTC, ryzyko polityczne, skorelowane
kryzysy pogodowe — 90 §6.)*

---

## 6. Ekonomia (wersja uproszczona)

**DECYZJA (bez zmian): walutą gry jest złoty (PLN)** — etykieta i kurs są parametrem
konfiguracji.

- **Przychód:** każda MWh **dostarczona** do miast × stała taryfa (~**450 zł/MWh**, parametr
  scenariusza). Straty przesyłowe nie są opłacane — gracz płaci za nie paliwem.
- **Koszty zmienne:** paliwo (koszt zmienny × produkcja), zakup importu.
- **Koszty stałe:** utrzymanie obiektów [zł/MW/rok], naliczane dobowo (roczne/365 × liczba
  reprezentowanych dni doby).
- **Kary:** energia niedostarczona (§4.5).
- **Skalowanie doby:** wynik doby × 10,9 (robocza) / × 8,7 (wolna) — §2.1.
- **Finansowanie:** wyłącznie kapitał startowy (10 mld zł) i zyski. Kredytów, obligacji
  i bankructwa w wersji uproszczonej nie ma *(90 §5)* — kto wyda wszystko, czeka na wpływy
  z taryfy.

Zdrowa pętla ekonomiczna: tania podstawa i OZE pokrywają większość energii, szczyt kosztuje
(gaz/import/magazyn), niepewność pogody wymusza płatny zapas, a marża finansuje kolejne
przyłączenia — które podnoszą i przychody, i ryzyko. *(Merit order, cena krańcowa, PPA,
LCOE — 90 §5.)*

---

## 7. Budowa i rozbudowa

- **Nowe obiekty:** wybór heksa → koszt (CAPEX × mnożnik terenu) → czas budowy w dobach gry →
  uruchomienie. Płatność z góry; anulowanie = utrata nakładów (§2.6).
- **DECYZJA (bez zmian): istniejące obiekty można rozbudowywać, z twardym limitem lokalizacji:**
  elektrownia do 4–6 bloków na heksie, farma wiatrowa/PV do limitu mocy heksa, magazyn do
  limitu modułów (moc i pojemność osobno), stacja wg §5.4, przyłącze graniczne o kolejne
  moduły zdolności. Rozbudowa jest szybsza (~60–75% czasu greenfield) i tańsza (~10–20%
  CAPEX-u) od nowej lokalizacji. Po osiągnięciu limitu jedyną drogą jest nowa lokalizacja.
- Nowy blok ma własny licznik budowy; linie można dobudowywać równolegle na tej samej trasie.

*(Malejące przychody krańcowe na farmach — wake effect, ryzyko koncentracji, opór społeczny,
starzenie majątku i remonty, kolejka przyłączeniowa — 90 §3, §7, §10.)*

---

## 8. Interfejs (wersja uproszczona)

1. **Mapa** — heksy, obiekty, linie w kolorach obciążenia (zielony → żółty → czerwony);
   miasto w niedoborze gaśnie/miga.
2. **Wykres doby** — zapotrzebowanie (prawda za nami, prognoza z pasmem przed nami) vs
   pokrycie warstwami (jądrowa/węgiel/gaz/wiatr/PV/magazyn/import).
3. **Panel prognozy** — pasma popytu i OZE na kolejne godziny + kolumna **„bilans przy
   obecnych nastawach"** (czy plan przeżyje najbliższe 6 h — 06 §8.6.4).
4. **Panel nastaw** — jednostki z suwakami, magazyny (ładuj/oddawaj), import/eksport,
   saldo bilansu. **DECYZJA: bez auto-nastaw** — wszystkie nastawy ustawia gracz ręcznie,
   nie ma przycisku „obsadź najtaniej".
5. **Panel finansowo-inwestycyjny** — budżet, wynik doby, katalog budowy, harmonogram budów.

**Handoff UI (`design_handoff_electronation_turn_ui/`) jest wskazówką wyłącznie wizualną** —
paleta, typografia, układ ekranu, styl mapy i kart. Zakres funkcjonalny gry wynika z tego
dokumentu: np. wskaźnik częstotliwości widoczny w handoffie **nie istnieje** w wersji
uproszczonej (wraca z 90 §1), a karty prognozy i pasek 24 tur obowiązują.

---

## 9. Cel gry i zakończenie (wersja uproszczona)

Wersja uproszczona jest **piaskownicą z celami**:

- **Cel długofalowy:** przyłączyć i niezawodnie zasilać wszystkie miasta mapy; wskaźniki:
  wartość majątku, roczny zysk, energia niedostarczona ≈ 0.
- **DECYZJA: nie ma twardego stanu przegranej.** Porażka jest zawsze miękka: brak środków =
  stagnacja (czekanie na wpływy z taryfy), chroniczne niedobory = rujnujące kary. Złe decyzje
  bolą finansowo i wizerunkowo, ale zawsze da się grać dalej.

*(Kampanie, scenariusze, warunki zwycięstwa pełnej gry — 90 §11.)*

---

## 10. Świadome uproszczenia

### 10.1 Odłożone — czekają w [90-pomysly-na-przyszlosc.md](90-pomysly-na-przyszlosc.md)

| Mechanika | Gdzie |
|---|---|
| DC power flow, częstotliwość, inercja, rezerwy, N-1, kaskady/SCO/blackout | 90 §1 |
| OZE pozostałe: wiatr morski, wodna, biomasa; hydrologia, złoża, strefy klimatyczne | 90 §2 |
| Unit commitment: minima, rozruchy, remonty, starzenie majątku | 90 §3 |
| Stacje zaawansowane: układy rozdzielni, kompensacja, poziomy napięć | 90 §4 |
| Merit order, cena krańcowa, PPA, kredyty, LCOE | 90 §5 |
| Sąsiedzi z charakterami, NTC, przepływy kołowe, ryzyko polityczne | 90 §6 |
| Regulator, rząd, opinia publiczna, kolejka przyłączeniowa | 90 §7 |
| Zdarzenia losowe niepogodowe: awarie, strajki, cyberataki | 90 §8 |
| Segmenty odbiorców, temperatura→popyt w pełnej formie, DSR, prosumenci | 90 §9 |
| Niuanse rozbudowy, drzewko technologiczne (HVDC, SMR, wodór) | 90 §10 |
| Kampanie, wyzwania, multiplayer, auto-dyspozycja | 90 §11 |

*(Pogoda i jej zjawiska — Dunkelflaute, sztormy — NIE są odłożone: wynikają z dokumentu 06
i krzywych mocy OZE. Odłożone są tylko zdarzenia niepogodowe.)*

### 10.2 Trwałe (nie planujemy modelować)

Sieć niskiego napięcia (agregacja w mieście) · przebiegi przejściowe i zwarcia w skali
milisekund · pełny model AC z kątami fazowymi (poza ewentualnym trybem „Symulacja") ·
szczegółowa struktura rynku (RDN/RB) · ciepłownictwo poza kogeneracją · rynek paliw poza
indeksem ceny.

---

## 11. Decyzje i pytania otwarte

### Rozstrzygnięte (obowiązujące)

| # | Decyzja | Gdzie |
|---|---|---|
| ✅ | **Uproszczony przepływ (0.7/0.8)**: model „wodociągowy" — bilans godzinowy, przepustowości linii i stacji, straty liniowe od długości; bez praw Kirchhoffa | 4 |
| ✅ | **W wersji uproszczonej są: PV, wiatr lądowy, magazyny, stacje, prognozy z błędem** (0.8) | 5, 2.4 |
| ✅ | Pogoda wg dokumentu 06 (reżimy, prawda przy init doby, seed) | 2.4, 06 |
| ✅ | Skala czasu — 3 doby reprezentatywne na miesiąc (36 dób/rok) | 2.1 |
| ✅ | Gra turowa — 24 tury po godzinie | 2.2 |
| ✅ | Prognoza z błędem zamiast stanu bieżącego — źródło napięcia | 2.4 |
| ✅ | Przewijanie tur sterowane przez gracza | 2.5 |
| ✅ | **Start z minimalnym stanem posiadania** (elektrownia + sieć + jedno miasto, darmowe); pozostałe miasta niepodłączone | 3.4 |
| ✅ | Skala systemu ~1 GW → 20–30 GW, wynika z przyłączeń | 3.4 |
| ✅ | Waluta — złoty (PLN), parametr | 6 |
| ✅ | Przelicznik 25 km/heks | 3.1 |
| ✅ | Kapitał startowy 10 mld zł, konfigurowalny | 3.4 |
| ✅ | Czasy budowy K ≈ 5, wzrost zapotrzebowania ~10%/rok | 2.6 |
| ✅ | Rozbudowa istniejących obiektów z twardymi limitami | 7 |
| ✅ | Handoff UI = wskazówka wyłącznie wizualna; wymagania z dokumentów | 8 |
| ✅ | Algorytm rozpływu: **min-cost flow**, deterministyczny | 4.4 |
| ✅ | Prototyp: pogoda etapami — krok 1 bez reżimów, krok 2 reżimy z 06 §8 | 12 |
| ✅ | Import i eksport dostępne od startu | 5.7 |
| ✅ | Bez auto-nastaw — wszystkie nastawy ręczne | 8 |
| ✅ | Promień obsługi stacji = 1 heks | 3.3 |
| ✅ | Brak twardego stanu przegranej — porażka zawsze miękka | 9 |
| ✅ | **Kampania nieskończona**, bez wariantów długości | 2.7 |

### Zawieszone (decyzje z 0.6 odłożone, nie cofnięte)

| Decyzja | Status |
|---|---|
| Model elektryczny: DC power flow (z częstotliwością i rezerwami) | wraca jako poziom „Standard" — 90 §1 |

### Otwarte

1. **Platforma i silnik docelowy** — nie blokuje prototypu (prototyp jest kodem jednorazowym).
2. **Krzywa nasycenia wzrostu** w nieskończonej kampanii (§2.7): jak spowalniać wzrost, gdy
   system zbliża się do sufitu 20–30 GW — do dokumentu 05.

---

## 12. Dokumenty i kolejne kroki

| # | Dokument | Zakres | Status |
|---|---|---|---|
| 02 | **Model symulacji uproszczonej** | graf sieci (stacje/linie), rozpływ **min-cost flow** (§4.4), straty, niedobory, integracja pogody i prognoz z 06, krok tury | do napisania — **pierwszy** |
| 03 | **Model ekonomiczny v1** | strojenie taryfy, kosztów, kar; test „czy 10 mld domyka otwarcie" | do napisania |
| 04 | **Katalog obiektów v1** | ostateczne liczby: elektrownie, OZE, linie, stacje, magazyny, przyłącza graniczne | do napisania |
| 05 | **Model zapotrzebowania** | profile godzinowe, sezonowość, czynnik pogodowy, wzrost i przyłączanie miast | do napisania |
| 06 | [Model astronomiczny i pogodowy](06-model-astronomiczny-i-pogodowy.md) | pogoda, produkcja OZE, model błędu prognozy — **obowiązuje w wersji uproszczonej** | ✅ napisany |
| 07 | **Model mapy i generator** | struktura danych heksa (w tym potencjał wiatru/nasłonecznienie), generacja proceduralna, trasowanie linii | do napisania |
| 08 | **Projekt interfejsu** | przełożenie handoffu wizualnego na zakres funkcjonalny §8 | handoff wizualny istnieje |
| 09 | **Progresja i onboarding** | minimalny start jako samouczek; co dopowiedzieć wprost | do napisania |
| 10 | **Architektura techniczna** | silnik, moduły, format zapisu, seed i odtwarzalność | do napisania |
| 90 | [Pomysły na przyszłość](90-pomysly-na-przyszlosc.md) | magazyn mechanik odłożonych + kolejność przywracania | ✅ napisany |

*(Dawny plan dokumentu 06b — katalog zdarzeń losowych — scalony do 90 §8.)*

### Następny krok: prototyp wersji uproszczonej

Poprzedni prototyp (dyspozytor.html) weryfikował pełny model — jego wyniki zarchiwizowane
w 90 §1.8 (astronomia z 06 potwierdzona co do minuty — te testy obowiązują nadal). Nowy
prototyp ma zweryfikować **pętlę uproszczoną**: mapa z 2–3 miastami, stacje i linie, wiatr
+ PV z prognozą, rozpływ min-cost flow, rozegranie kilku dób.

**DECYZJA: pogoda wchodzi do prototypu etapami.** Krok 1: astronomia + rozkład wiatru
(Weibull + krzywa mocy) bez reżimów — wystarczy, żeby przetestować bilansowanie i prognozę.
Krok 2: reżimy pogodowe i zmienność wewnątrzdobowa (06 §8). Etapowanie dotyczy tylko
kolejności implementacji — reżimy pozostają częścią wersji uproszczonej gry.

Pytania do odpowiedzi:

1. **Ile realnie trwa tura?** (tempo gry — czy rok ≈ 2–2,5 h z §2.5 się potwierdza)
2. Czy **bilansowanie pod niepewną prognozą** jest frajdą przy uproszczonym przepływie —
   czy gracz faktycznie planuje na pasmach, zamiast reagować po fakcie?
3. Czy **przepustowość, stacje i straty są czytelne na mapie** — czy gracz rozumie, dlaczego
   energia nie dociera?
4. Ile dób z rzędu da się zagrać, zanim pojawi się znużenie?

---

*Dokument koncepcyjny — wartości liczbowe są orientacyjne i wymagają strojenia na etapie
prototypu.*
