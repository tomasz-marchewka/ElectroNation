# ElectroNation — Pomysły na przyszłość (mechaniki odłożone)

**Wersja:** 0.4
**Data:** 2026-08-20
**Status:** magazyn projektowy — nic z tego dokumentu **nie wchodzi** do wersji uproszczonej gry
**Dokument nadrzędny:** [01-mechanika-gry.md](01-mechanika-gry.md) (od wersji 0.7)

**Zmiany 0.3 → 0.4:** **wiatr morski wraca do gry** (01 v0.22 §5.2) i znika z §2 — nie
wymagał niczego z tego magazynu, bo klasa wiatrowa „Morze — Bałtyk" siedziała w modelu 06
§6.1 od jego wersji 0.4, a jedyną brakującą częścią była zgoda na budowę obiektu na wodzie.
W §2 zostaje to, co przy tej okazji świadomie **odłożono**: poziomy oddalenia od brzegu,
HVDC i wiatr na jeziorach.

**Zmiany 0.2 → 0.3:** po uproszczeniach 01 v0.11 doszły do magazynu: **topologia stacyjna**
(obiekty przyłączane do stacji w promieniu 1 heksa, linie tylko między stacjami) oraz
**typy linii wg poziomów napięć** (110/220/400 kV) — oba w §4.

**Zmiany 0.1 → 0.2:** po doprecyzowaniu zakresu uproszczenia (01 v0.8) **wróciły do gry**:
OZE (PV, wiatr lądowy) z pogodą i całym dokumentem 06, prognozy pogody i zapotrzebowania
z błędem, stacje elektroenergetyczne w prostej formie oraz zjawiska pogodowe (Dunkelflaute,
sztormy). Dokument zawiera teraz wyłącznie to, co nadal odłożone; sekcje przenumerowane
i zaktualizowana kolejność przywracania (§14).

---

## 0. Po co ten dokument

W wersji 0.7/0.8 dokumentu 01 gra została **celowo uproszczona**: silnik przepływu energii
to model „wodociągowy" (przepustowości + straty od długości), a warstwy takie jak fizyka
rozpływów, rynek energii czy regulator zostały wycięte. Wszystko, co wycięte, jest tutaj.

**To nie jest kosz na śmieci.** Mechaniki opisane niżej były przemyślane i większość z nich
uważamy nadal za dobre pomysły — ale każda z nich ma wrócić do gry **osobno, świadomą
decyzją**, dopiero gdy prosta wersja będzie działać i będzie frajdą. Test przy przywracaniu
brzmi zawsze tak samo: *czy ta mechanika dodaje graczowi ciekawych decyzji, czy tylko
realizmu?*

Pełny tekst pierwotny (z kontekstem i uzasadnieniami w miejscu) jest w historii gita:
`docs/01-mechanika-gry.md` w wersji **0.6**.

---

## 1. Fizyczny model elektryczny — DC power flow

**Największa odłożona mechanika.** Pierwotna kluczowa idea gry brzmiała: *gracz nie kieruje
energią — kieruje nią fizyka*. Rozpływ mocy miał wynikać z praw Kirchhoffa (reaktancji linii),
a nie z decyzji gracza — stąd przeciążenia, przepływy kołowe i sytuacje „mam nadmiar mocy,
ale nie tam, gdzie trzeba".

W wersji uproszczonej rozpływ jest **modelem transportowym** (01 §4), co odpowiada dawnemu
poziomowi „Arcade". Docelowa drabinka poziomów szczegółowości:

| Poziom | Model | Co daje |
|---|---|---|
| **Arcade** ✅ *(= wersja uproszczona)* | bilans energii, sieć jako graf przepustowości | łatwy start, brak fizyki rozpływów |
| **Standard** *(przyszłość)* | **DC power flow** — rozpływ wyznaczany przez reaktancje linii | realne przeciążenia, zatory, przepływy kołowe |
| **Symulacja** *(daleka przyszłość)* | uproszczony **AC power flow** — moc czynna + bierna, napięcia węzłowe | mechanika napięcia, kompensacja mocy biernej |

### 1.1 Częstotliwość — globalna miara bilansu

Jedna liczba dla całego kraju: rośnie przy nadprodukcji, spada przy niedoborze.
Progi (do przywrócenia razem z modelem):

| Zakres | Stan | Konsekwencje |
|---|---|---|
| 49,95 – 50,05 Hz | normalny | wszystko OK |
| 49,80 – 49,95 Hz | podwyższona czujność | ostrzeżenie, uruchomienie rezerwy |
| 49,50 – 49,80 Hz | alarm | automatyczna rezerwa, kara jakościowa |
| 49,00 – 49,50 Hz | zagrożenie | **automatyczne odłączanie odbiorów (SCO)** |
| < 48,50 Hz | krytyczny | kaskadowe odłączanie bloków → **blackout** |
| > 50,20 Hz | nadmiar | odłączanie generacji, straty finansowe |

### 1.2 Napięcie — zjawisko lokalne

Każda stacja ma własne napięcie, wynik bilansu mocy biernej w węźle. Za niskie napięcie
w regionie = kary jakościowe, ryzyko lawiny napięciowej. Regulacja: zaczepy transformatorów,
baterie kondensatorów, dławiki, generatory w trybie kompensacji. Wchodzi dopiero z poziomem
„Symulacja".

### 1.3 Inercja systemu

Wirujące masy turbin spowalniają zmiany częstotliwości. Falowniki (PV, wiatr, baterie)
inercji nie dają — im większy udział źródeł bezinercyjnych, tym szybciej spada częstotliwość
po awarii i tym mniej czasu na reakcję. Naturalny „ukryty koszt" transformacji energetycznej
i dobre wyzwanie mid/late-game. Przeciwdziałanie: kompensatory synchroniczne, baterie
grid-forming, bloki na minimum technicznym.

### 1.4 Rezerwy mocy

Wolna moc utrzymywana na wypadek awarii — koszt bez przychodu, którego brak kończy się
blackoutem:

| Rodzaj rezerwy | Czas aktywacji | Typowe źródło |
|---|---|---|
| **Pierwotna (FCR)** | sekundy | regulatory turbin, baterie |
| **Wtórna (aFRR)** | do 5 minut | bloki w ruchu, wodne, baterie |
| **Trójna (mFRR)** | 15–30 minut | turbiny gazowe OCGT, szczytowo-pompowe |
| **Zimna** | godziny | bloki w postoju |

Reguła kciuka: rezerwa ≥ moc największej pracującej jednostki (kryterium największego
pojedynczego zakłócenia). Z rezerwami wiąże się **statyzm (droop)** — proporcjonalna,
automatyczna odpowiedź regulatorów turbin na uchyb częstotliwości.

### 1.5 Straty kwadratowe

W wersji uproszczonej straty są liniowe (procent na 100 km). Docelowo: `P_strat = 3·I²·R` —
straty rosną z **kwadratem** obciążenia, więc linia mocno obciążona traci nieproporcjonalnie
dużo, a przesył na wyższym napięciu drastycznie ogranicza straty. Wartości referencyjne:
sieć przesyłowa ~1,5–2,5%, dystrybucja ~5–7%, łącznie ~7–9%.

### 1.6 Kryterium N-1

System musi przetrwać awarię dowolnego pojedynczego elementu bez utraty zasilania odbiorców.
W grze: widok analityczny pokazujący elementy krytyczne + regulator wymagający N-1
w rosnącym procencie węzłów. To główny driver rozbudowy sieci niezależny od wzrostu
zapotrzebowania — bez niego gracz buduje sieć minimalną i gra na krawędzi.

### 1.7 Kaskada awarii, SCO, blackout i odbudowa

```
Awaria bloku 800 MW
   ↓
Spadek częstotliwości (tempo zależy od inercji)
   ↓
Rezerwa pierwotna hamuje spadek → wtórna przywraca 50 Hz
   ↓  (jeśli rezerwy nie starczy)
f < 49,0 Hz → automatyczne odłączanie odbiorów (SCO)
   ↓  (jeśli to nie wystarczy)
Przeciążenia linii przejmujących przepływ → zabezpieczenia
   ↓
KASKADA → BLACKOUT (całkowity lub obszarowy)
   ↓
Odbudowa: black start → wyspy → synchronizacja → normalna praca
   (godziny/dni, gigantyczne straty, kryzys polityczny)
```

Blackout to nie game over, lecz bolesna, zapamiętywalna porażka. Świadoma redukcja odbiorów
przez gracza jest płatna, ale tańsza niż SCO i nieporównanie tańsza niż blackout.

### 1.8 Wyniki pierwszego prototypu (dyspozytor.html — usunięty)

Prototyp pełnego modelu zweryfikował numerycznie: **I prawo Kirchhoffa z błędem 0 MW**
oraz astronomię zgodną z tabelą 06 §3.7 co do minuty. Te wyniki pozostają w mocy — testy
astronomiczne obowiązują każdą implementację 06 już teraz, a bilans węzłowy wróci przy
DC power flow. Obserwacja z rozgrywki: grudzień ze skaczącym wiatrem był trudniejszy niż
Dunkelflaute — **trudność bierze się z wariancji, nie z poziomu**.

---

## 2. OZE i pogoda — elementy nadal odłożone

*(PV, wiatr lądowy, **wiatr morski** (01 v0.22), reżimy pogodowe i prognozy z błędem są
w grze — dokument 06 obowiązuje. Tu zostaje reszta.)*

- **Poziomy oddalenia od brzegu** — w grze morze jest jednym terenem o jednej cenie
  (02 §8.1: ×2,5) i jednej klasie wiatrowej. Wariant rozwinięty: strefa przybrzeżna
  i pełnomorska jako osobne typy terenu — głębsza woda to droższy fundament (pływające zamiast
  posadowionych), ale i wyższe λ. Naturalnie łączy się z HVDC (§10) jako sposobem na
  wyprowadzenie mocy z daleka bez strat linii AC.
- **Wiatr na jeziorach** — dziś jezioro nie przyjmuje żadnego obiektu (02 §8.1). Wymagałoby
  najpierw jezior większych niż kilka heksów i własnej klasy wiatrowej (06 §6.2 daje im ten
  sam wykładnik profilu pionowego co morzu).
- **Wodna przepływowa** — wymaga cieku na heksie, sezonowość hydrologiczna, ~0 kosztu
  zmiennego, szybka regulacja.
- **Biomasa / biogaz** — sterowalne OZE o wysokim koszcie zmiennym.
- **Hydrologia heksów**: cieki i przepływy, woda chłodząca dla bloków cieplnych
  (upał + susza = ograniczenie mocy elektrowni).
- **Złoża paliw** na heksach (węgiel, gaz) — tania elektrownia „przy kopalni".
- **Ograniczenia terenowe**: park narodowy, teren wojskowy — zakaz lub opór społeczny.
- **Strefy klimatyczne i szerokości geograficzne** (06 §10) — konfigurowalne kraje:
  od Irlandii (wiatr) po Hiszpanię (PV, szczyt letni); kraje wieloszerokościowe, noc polarna.
- **Łagodne ograniczanie mocy turbin** zamiast twardego wyłączenia sztormowego —
  ulepszenie technologiczne późnej gry.

---

## 3. Unit commitment i ograniczenia techniczne jednostek

*(Rdzeń wszedł do gry w 01 v0.27 — §5.1: **minimum techniczne, rozruch zimny/ciepły,
rampy w górę/w dół i koszt rozruchu**, w wersji growej przeskalowanej do tury 3 h,
z jedną nastawą na elektrownię wykonywaną przez silnik. Tu zostaje reszta karty.)*

Pozostała karta jednostki:

- **minimalny czas pracy i postoju** — bloku nie włącza się co godzinę (w grze częściowo
  zastąpione oknem ciepłym i kosztem rozruchu),
- **rozruch gorący** jako trzeci stan obok zimnego i ciepłego; rozruch z realnym
  profilem poboru paliwa zamiast jednej opłaty,
- **rampy [MW/min] w realistycznej skali** — wymagałyby kroku gęstszego niż tura 3 h
  (§13); dzisiejsze wartości są growe z założenia,
- **plan per jednostka** — dziś gracz steruje elektrownią (silnik rozdziela bloki
  deterministycznie); pełny UC oddaje graczowi decyzję per blok,
- **dyspozycyjność** — awaryjność, remonty planowane,
- **emisje** CO₂, SO₂, NOₓ, pyły — koszty i akceptacja społeczna,
- **inercja (stała H)** i **zdolność black-start**.

Z tego wyrasta właściwy problem dobowy pełnej gry: *które bloki uruchomić i kiedy, ile
rezerwy trzymać* — klasyczny **plan pracy jednostek (unit commitment)** podejmowany
w warunkach niepewności prognozy. Wersja growa z 01 v0.27 już wymusza decyzje
wielogodzinne (rozruch zimny węgla = 3 tury, jądrówki = 8 tur); pełna wersja pogłębia
je o awaryjność i decyzje per blok.

Powiązane mechaniki cyklu życia:

- **Starzenie się majątku**: wiek → awaryjność, koszty utrzymania, spadek sprawności;
  wiek liczony per jednostka, nie per lokalizacja.
- **Remonty planowane**: jednostka znika na X dni — mini-łamigłówka rozkładania remontów
  w roku (najlepiej latem).

---

## 4. Stacje, typy linii i topologia sieci — elementy zaawansowane

*(Stacja rozdzielcza jako węzeł z przyłączami liniowymi jest w grze — 01 §4.3, §5.4.
Tu zostaje głębia oraz mechaniki uchylone w 01 v0.11.)*

**Przepustowość stacji [MW]** *(w grze 01 v0.12–0.20; zdjęta w 0.21 jako dublet limitu
linii)*: własny limit mocy węzła i pułapka „grube linie, cienka stacja". Wraca sensownie
dopiero razem z DC power flow (§1) i poziomami napięć, gdzie ograniczenie szyny wynika
z wymiarowania pól i transformacji, a nie jest drugą liczbą obok przepustowości linii.

**Typy linii wg poziomów napięć** *(→ **wróciły do gry w 01 v0.13**, §4.2, jako umowne
NN/SN/WN — 150/500/1500 MW)*: tu zostaje reszta głębi — realna hierarchia napięć,
transformacja między poziomami (stacje transformatorowe jako warunek łączenia typów),
ograniczenia „co można wpiąć w jaki poziom".

**Topologia stacyjna** *(w grze 01 v0.8–0.10; zastąpiona topologią bezpośrednią)*:
obiekty przyłączały się do stacji elektroenergetycznej w promieniu 1 heksa, a linie
biegły wyłącznie między stacjami. Wymuszała planowanie „stacja najpierw", ale w prototypie
okazała się nadmiarowym krokiem przy każdej inwestycji. Kandydatka do powrotu razem
z poziomami napięć (stacja jako miejsce transformacji).

Pełna hierarchia napięć, do której stacje docelowo należą:

| Poziom | Napięcie | Rola | Typowa przepustowość |
|---|---|---|---|
| NN | 400 kV | „autostrady" — przesył międzyregionalny | 1200–2500 MW / tor |
| WN | 220 kV | starsza warstwa przesyłowa | 400–600 MW |
| WN | 110 kV | zasilanie regionów i dużego przemysłu | 100–200 MW |
| SN | 15 kV | rozdział wewnątrz miasta | 5–15 MW |
| nN | 0,4 kV | odbiorcy końcowi | *abstrahowane* |

Z hierarchią wraca zasada „stacja = jedyne miejsce spotkania dwóch poziomów napięcia"
(dziś w grze jest jeden typ linii, łączący obiekty swobodnie). Odłożone elementy stacji:

- **układ rozdzielni**: pojedynczy system szyn / podwójny / półtorawyłącznikowy —
  N-1 na poziomie stacji (awaria szyn przy tanim układzie = cała stacja w ciemnościach),
- **kompensacja mocy biernej** (kondensatory, dławiki) — wchodzi z napięciem (§1.2),
- **automatyka i telemechanika** — zdalne sterowanie vs wysyłanie ekipy,
- widok **schematu jednokreskowego** z polami i wyłącznikami (dla graczy hardcore).

---

## 5. Rynek energii i zaawansowana ekonomia

W wersji uproszczonej jest stała taryfa i koszty paliwa. Pełny model:

### 5.1 Merit order i cena krańcowa

Jednostki wchodzą do pracy w kolejności rosnącego kosztu zmiennego; **cena rynkowa godziny =
koszt zmienny najdroższej pracującej jednostki**. Tanie źródła zarabiają różnicę.
Konsekwencje, które gracz miał odkrywać sam:

- dołożenie taniego OZE obniża cenę rynkową — i marżę własnych elektrowni konwencjonalnych,
- elektrownia szczytowa pracuje 200 h w roku, ale wtedy zarabia krocie,
- magazyn żyje z arbitrażu: ładuj tanio w nocy, oddawaj drogo w szczycie.

### 5.2 Struktura przychodów

| Źródło | Charakterystyka |
|---|---|
| **Taryfa gospodarstw domowych** | regulowana — gracz proponuje, regulator zatwierdza; podwyżka = spadek zadowolenia |
| **Kontrakty biznesowe** | negocjowane: wolumen, cena, kary za niedostarczenie |
| **PPA** | stała cena na lata — bezpieczeństwo kosztem potencjalnego zysku |
| **Eksport** | cena rynkowa sąsiada minus koszty |
| **Opłaty przesyłowe i dystrybucyjne** | za korzystanie z sieci |
| **Usługi systemowe / rynek mocy** | opłata za gotowość i rezerwę |
| **Opłaty przyłączeniowe** | jednorazowe od nowych odbiorców |

### 5.3 Koszty zaawansowane

Zmienne ceny paliw (ryzyko cenowe), **rosnące uprawnienia CO₂**, kary jakościowe
(energia niedostarczona, parametry), cele OZE, podatki lokalne.

### 5.4 Finansowanie

Kapitał własny / **kredyt** (odsetki zależne od ratingu) / **obligacje** / dotacje celowe.
**Bankructwo** = przegrana. Do tego **LCOE** jako narzędzie porównawcze inwestycji
(uczy, że „tania w budowie" ≠ „tania w eksploatacji") oraz rozbudowane **kary za anulowanie
budowy** (rosnące z zaawansowaniem; w wersji uproszczonej: prosta utrata nakładów).

### 5.5 Konkurencja

Otwarte pytanie z 0.6: czy gracz jest monopolistą, czy istnieją konkurencyjni wytwórcy
rywalizujący o kontrakty.

---

## 6. Wymiana transgraniczna — pełny model

W wersji uproszczonej import/eksport to stałe ceny i limit mocy. Pełny model:

- Sąsiedzi (3–5) z własną symulowaną charakterystyką: profil cen dobowy i roczny, struktura
  wytwarzania (sąsiad wiatrowy tani przy wietrze, jądrowy stabilny), własne niedobory.
- **Korelacja pogody z sąsiadami** — kluczowa mechanika, nie szczegół: gdy nam brakuje,
  im zwykle też (ten sam wyż). Strategia „w razie czego zaimportuję" musi zawodzić dokładnie
  wtedy, gdy jest najpotrzebniejsza.
- **NTC** — zdolność handlowa mniejsza niż fizyczna przepustowość (margines bezpieczeństwa).
- **Przepływy nieplanowe (kołowe)** — cudzy handel płynie fizycznie przez naszą sieć;
  rozwiązanie: przesuwniki fazowe. (Wymaga DC power flow — §1.)
- **Ryzyko polityczne** — sąsiad może z dnia na dzień ograniczyć eksport w kryzysie.
- Ceny importu/eksportu zmienne w ciągu doby, harmonogram wymiany ustawiany z wyprzedzeniem.

---

## 7. Regulator, polityka i społeczeństwo

Warstwa nadająca decyzjom kontekst i zapobiegająca czysto optymalizacyjnej grze:

- **Regulator**: wskaźniki SAIDI / SAIFI / ENS, parametry jakościowe (częstotliwość, napięcia,
  N-1), zatwierdzanie taryf, cele OZE i limity emisji rosnące z latami, licencja (utrata =
  przegrana).
- **Rząd**: polityka energetyczna zmienna po wyborach (zmiana kursu w połowie inwestycji),
  dotacje, nakazy (wyłączenie węgla, zakaz atomu).
- **Opinia publiczna**: ceny, przerwy, smog, **NIMBY** (linia 400 kV przez teren zamieszkany =
  protesty → dłuższa budowa albo droższy wariant kablowy), presja na przyłączanie miast
  czekających zbyt długo.
- **Kolejka przyłączeniowa**: nowi duzi odbiorcy (fabryka, data center) i źródła składają
  wnioski; gracz wydaje warunki przyłączenia albo odmawia. Odmowa = utrata przychodu i zła
  prasa; zgoda bez rozbudowy sieci = przeciążenia.

---

## 8. Zdarzenia losowe niepogodowe

Zjawiska pogodowe (Dunkelflaute, sztormy, sezonowość) **są w grze** — wynikają z reżimów 06.
Odłożone są zdarzenia spoza pogody (planowane dawniej jako dokument 06b):

- **awarie**: blok wypada z ruchu, awaria transformatora (naprawa trwa miesiącami —
  transformatory 400 kV produkuje się na zamówienie), wyłączenie linii, pożar,
- **długotrwałe**: strajk w kopalni, skok cen gazu, cyberatak na system sterowania,
  katastrofa u sąsiada,
- pogodowe zjawiska **uszkodzeniowe** (dziś pogoda wpływa tylko na produkcję i popyt):
  oblodzenie i szadź zrywające przewody, wyładowania wyłączające linie, mróz zamrażający
  instalacje paliwowe, upał obniżający obciążalność przewodów o 10–20%, zaćmienie słońca.

Zasady skalowania przy 36 dobach/rok: zdarzenia jednodobowe z prawdopodobieństwem ~10×
rzeczywistego dziennego; zjawiska wielodniowe losowane **na poziomie miesiąca** (jak reżimy
pogodowe); zdarzenia długotrwałe rzutują na N kolejnych miesięcy.

Pierwszy kandydat do przywrócenia: **awaria bloku** — dopiero ona nadaje sens trzymaniu
zapasu mocy ponad błąd prognozy.

---

## 9. Odbiorcy — segmenty i strona popytowa

W wersji uproszczonej miasto ma jeden zagregowany profil (plus czynnik sezonowy i pogodowy).
Pełny model — miasto jako suma segmentów o różnych profilach, wrażliwości cenowej i skutkach
przerwy:

| Segment | Charakterystyka poboru | Wrażliwość na cenę | Skutek przerwy |
|---|---|---|---|
| **Gospodarstwa domowe** | szczyt poranny i wieczorny (dominujący), głęboka dolina nocna | niska | bardzo zły odbiór społeczny |
| **Usługi / handel / biura** | płasko 8–18, weekend niżej | średnia | straty, skargi |
| **Przemysł ciężki** | płasko 24/7 | wysoka (negocjuje taryfę) | ogromne kary umowne |
| **Przemysł jednozmianowy** | prostokąt 6–14 w dni robocze | średnia | straty produkcyjne |
| **Transport / trakcja** | szczyty komunikacyjne, skoki | niska | paraliż |
| **Data center** *(późna gra)* | idealnie płaski, rosnący | wysoka | kary SLA |
| **Rolnictwo / nawadnianie** | sezonowy, letni | wysoka | straty w zbiorach |

Sedno: miasto przemysłowe i sypialne o tej samej mocy szczytowej wymagają innego portfela
wytwórczego — gracz ma rozumieć **strukturę** popytu, nie tylko wielkość.

Modyfikatory popytu do przywrócenia w pełnej formie: jawna krzywa „V" temperatury
(ogrzewanie < 15 °C, klimatyzacja > 22 °C — dziś temperatura działa tylko pośrednio przez
reżim), święta z własnym profilem, „TV pickup", **elektryfikacja** (EV: nowy szczyt nocny;
pompy ciepła: wyższy szczyt zimowy), efektywność energetyczna, **prosumenci i duck curve**
(PV na dachach → stroma rampa wieczorna), **DSR** — sterowanie stroną popytu jako mechanika
lub modyfikator (pytanie otwarte z 0.6).

---

## 10. Rozbudowa zaawansowana i drzewko technologiczne

Wersja uproszczona ma rozbudowę obiektów z twardym limitem lokalizacji. Odłożone niuanse:

- **Malejące przychody krańcowe** na farmach wiatrowych (wake effect: kolejne turbiny
  zabierają sobie wiatr, −5…10% produktywności na poziom).
- **Przyłącze jako wąskie gardło** — rozbudowa źródła wymusza rozbudowę stacji i linii;
  ukryty koszt ujawniany w studium wykonalności.
- **Ryzyko koncentracji** — trzy gigantyczne lokalizacje są tańsze, ale kruchsze (rezerwa
  pod największą jednostkę, N-1 na przyłączu).
- **Opór społeczny narastający z rozmiarem** (trzeci blok przechodzi, szósty wywołuje protesty).
- Pełny cykl inwestycyjny: studium wykonalności → decyzja środowiskowa → finansowanie →
  ryzyko opóźnień i przekroczeń budżetu → rozruch → eksploatacja → modernizacja/rozbiórka.
- **Wyższe wieże turbin** jako ulepszenie (wykładnik profilu pionowego wiatru — 06 §6.2).

**Wektory rozwoju technologicznego** (odblokowywane latami i/lub B+R):

- tańsze i wydajniejsze PV / wiatr / baterie,
- **HVDC** — przesył na duże odległości z małymi stratami, sterowalny przepływ
  (obchodzi fizykę AC),
- inteligentne sieci, DSR, liczniki zdalne,
- wodór (P2G2P, sprawność ~35%, magazyn sezonowy), SMR-y,
- magazyn ciepła przy kogeneracji,
- kolejne poziomy systemów prognostycznych (mnożniki σ — 06 §8.6.3 — w grze jest wersja
  podstawowa mechaniki, tu: rozbudowa w pełne drzewko).

---

## 11. Tryby gry, kampania, multiplayer

- **Kampania scenariuszowa** — scenariusze z ustalonym horyzontem i celami („wyłącz węgiel
  do 2040 bez blackoutu", „odbuduj system po katastrofie", „zelektryfikuj kraj rozwijający
  się"). Gra bazowa jest kampanią nieskończoną bez stanu przegranej (01 §2.7, §9) — twarde
  warunki zwycięstwa i porażki wracają dopiero tutaj.
- **Wyzwania** — pojedyncze doby („przetrwaj Dunkelflaute", „zbilansuj po awarii 2 GW"),
  tabela wyników.
- **Scenariusze historyczne** — odtworzenie prawdziwych blackoutów.
- **Poziomy trudności**: dokładność prognoz, częstotliwość awarii, surowość regulatora,
  koszt kapitału, tempo wzrostu, poziom modelu elektrycznego (Arcade/Standard/Symulacja).
- **Multiplayer** — każdy gracz to kraj; handel i pomoc awaryjna między nimi. Duży zakres,
  odłożone bezterminowo.
- **Auto-dyspozycja dób** — automat rozgrywający powtarzalne doby z celowo gorszym wynikiem
  (−10…15% marży); zawór bezpieczeństwa przeciw znużeniu w długiej kampanii.

Warunki zwycięstwa/porażki pełnej wersji: cele klimatyczne bez utraty niezawodności, wartość
firmy, wskaźnik łączony (niezawodność × cena × czystość); porażka przez bankructwo, blackout
dyskwalifikujący, utratę licencji, dymisję. Filozofia: przegrana pouczająca, nie nagła —
katastrofa widoczna z wyprzedzeniem we wskaźnikach.

---

## 12. Interfejs zaawansowany

Widoki powiązane z odłożonymi mechanikami:

- panel dyspozytorski z centralnym wskaźnikiem częstotliwości (§1.1),
- warstwa napięć węzłowych — mapa cieplna (§1.2),
- panel analityczny N-1 i mapa wąskich gardeł (§1.6),
- schemat jednokreskowy stacji (§4),
- katalog inwestycyjny z porównaniem LCOE (§5.4).

---

## 13. Pytanie otwarte odziedziczone: gęstość kroku silnika

Czy silnik liczy wewnętrznie gęściej niż tura (podkroki 15-minutowe, przebieg częstotliwości
wewnątrz fazy rozstrzygnięcia)? Dotyczy dopiero modelu z częstotliwością (§1). Zwiększa
wierność i widowiskowość fazy rozstrzygnięcia kosztem złożoności.

---

## 14. Sugerowana kolejność przywracania

Kolejność jest propozycją — każdy krok wraca osobno i tylko jeśli przechodzi test frajdy:

1. **Awarie jednostek i linii** (§8) — trzymanie zapasu mocy zaczyna mieć sens ponad błąd
   prognozy.
2. **Unit commitment — pozostała część** (§3; rdzeń — minima, rozruchy, rampy — wszedł
   do gry w 01 v0.27): dyspozycyjność, remonty, rozruch gorący, plan per jednostka.
3. **Merit order i cena krańcowa** (§5) — ekonomia zaczyna żyć.
4. **DC power flow + częstotliwość + inercja + rezerwy** (§1) — przejście Arcade → Standard.
5. **Stacje zaawansowane i poziomy napięć** (§4) oraz **N-1** (§1.6) — pełne planowanie sieci.
6. Pozostałe warstwy (regulator §7, sąsiedzi §6, segmenty §9, kampanie §11, B+R §10) —
   według potrzeb.
