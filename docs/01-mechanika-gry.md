# ElectroNation — Dokument bazowy mechaniki gry

**Wersja:** 0.6 (dokument koncepcyjny)
**Data:** 2026-08-07
**Status:** propozycja do przedyskutowania — szczegóły techniczne w kolejnych dokumentach

**Zmiany 0.5 → 0.6:** rozstrzygnięto wszystkie cztery „luki" z §19: **skala systemu** (od ~1 GW do 20–30 GW, wynika z przyłączonych miast — §3.4), **waluta** (złoty, konfigurowalna — §12), **przelicznik 25 km/heks** (heks mieści duże miasto — §3.1), **kapitał startowy 10 mld zł** (parametr konfiguracji — §3.4).

**Zmiany 0.4 → 0.5:** czasy budowy skrócone **ponownie o połowę** (K ≈ 5) — elektrownia jądrowa buduje się **2 lata**; zgodnie z zasadą zachowania proporcji (§2.6) tempo wzrostu zapotrzebowania rośnie do ~10%/rok. Dodano **§10.2 — rozbudowa istniejących obiektów** (dodatkowe bloki, turbiny, panele, moduły magazynów) z twardymi limitami lokalizacji; dalsze podsekcje rozdziału 10 przenumerowane. Porządki spójności: tabela błędu prognozy (§2.4) generowana z wzorów 06 §8.6.2, rozdzielczość profili ujednolicona do 1 h (= tura), punkty skalowania finansów i zdarzeń przeniesione z §2.5 do §2.1, poprawione odesłania.

**Zmiany 0.3 → 0.4:** **gra jest turowa** — 24 tury po godzinie na dobę, zamiast 5-minutowej doby w czasie rzeczywistym (nowe sekcje 2.2–2.5). Powód: pauza nie zużywała budżetu, więc budżet nigdy nie był prawdziwym ograniczeniem. Napięcie przenosi się z presji czasu na **niepewność prognozy** — gracz widzi prognozę z błędem rosnącym z horyzontem, nie stan bieżący. Dodano przewijanie tur. Rampy jednostek cieplnych przestają wiązać przy krokach godzinowych; ograniczeniem zostaje czas rozruchu i minimum techniczne.

**Zmiany 0.2 → 0.3:** trzy decyzje — **model elektryczny: DC power flow** (sekcja 4), **start greenfield** z miastami niepodłączonymi (nowa sekcja 3.4), następny krok: **prototyp symulacji**. Uporządkowana sekcja 19: rozstrzygnięte / luki / otwarte.

**Zmiany 0.1 → 0.2:** rozstrzygnięto model skali czasu — przyjęto „3 doby reprezentatywne na miesiąc, 5 minut na dobę" (sekcje 2.1–2.4). W konsekwencji: skrócone czasy budowy z zasadą zachowania proporcji, przeskalowane prawdopodobieństwa zdarzeń, auto-dyspozycja zdegradowana z mechaniki podstawowej do opcjonalnego zaworu bezpieczeństwa. Czas w obrębie doby płynie **jednostajnie** — bez mapowania nierównomiernego.

---

## 1. Wizja

Gracz wciela się w rolę operatora systemu elektroenergetycznego (połączenie roli **OSP** — operatora sieci przesyłowej, **OSD** — operatora dystrybucyjnego i **wytwórcy**) w fikcyjnym kraju. Odpowiada za to, żeby w każdej sekundzie doby produkcja energii pokrywała jej zużycie, a jednocześnie żeby system rozwijał się wystarczająco szybko, by nadążyć za rosnącym zapotrzebowaniem.

Kluczowa idea, która odróżnia grę od typowych „budowniczych sieci": **gracz nie kieruje energią — kieruje nią fizyka**. Gracz buduje infrastrukturę i decyduje, które elektrownie pracują z jaką mocą. Rozpływ mocy w sieci wynika z praw Kirchhoffa, a nie z życzeń gracza. To rodzi zjawiska takie jak przeciążenia linii, przepływy kołowe i sytuacje, w których „mam nadmiar mocy, ale nie mogę jej dostarczyć tam, gdzie jest potrzebna".

Motto: *Energii nie da się magazynować w kablu.*

---

## 2. Pętla rozgrywki

Gra działa na dwóch przeplatających się pętlach czasowych.

```
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA STRATEGICZNA (miesiące / lata)                       │
│  Planuj → Inwestuj → Buduj (czas realizacji) → Uruchom      │
│      ↑                                              ↓        │
│      └──────── Analizuj wyniki i prognozy ←─────────┘        │
│                        ↑                                     │
│         ┌──────────────┴──────────────┐                      │
│         │  PĘTLA TAKTYCZNA (doba)     │                      │
│         │  Prognoza → Plan pracy →    │                      │
│         │  Dyspozycja w czasie rzecz. │                      │
│         │  → Reakcja na zdarzenia →   │                      │
│         │  → Rozliczenie doby         │                      │
│         └─────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Skala czasu — model „3 dób reprezentatywnych"

To najważniejsza decyzja projektowa gry: 30 lat rozgrywki to ~11 000 dób, a cała frajda z bilansowania jest właśnie w dobie. Nie da się zagrać wszystkich, a symulowanie ich automatem odbiera graczowi to, co najciekawsze.

**Przyjęty model — miesiąc składa się z 3 grywalnych dób reprezentatywnych:**

| Doba | Reprezentuje | Charakter |
|---|---|---|
| **Robocza A** | ~10,9 dnia roboczego | pełny profil przemysłowy + komunalny |
| **Robocza B** | ~10,9 dnia roboczego | jw., ale inna pogoda / inne zdarzenia |
| **Wolna** | ~8,7 dnia weekendowego/świątecznego | niskie i płaskie zapotrzebowanie, brak przemysłu |

*(miesiąc ma średnio 30,4 dnia: ~21,7 roboczych i ~8,7 wolnych)*

**Dlaczego ten model jest dobry:**
- Każda doba jest grana ręcznie — bilansowanie zostaje **główną mechaniką**, a nie opcjonalnym dodatkiem.
- Cykl 12 miesięcy × 3 doby doskonale oddaje **sezonowość** — styczniowa doba jest realnie inna od lipcowej.
- Proporcja 2:1 (roboczy:wolny) jest bliska rzeczywistej 2,5:1 — wystarczająco dokładna.

**Konsekwencje modelu:**

**(1) Skalowanie finansów i zużycia paliwa.**
Wynik jednej doby trzeba przemnożyć przez liczbę reprezentowanych dni: doba robocza ×10,9, doba wolna ×8,7. Dotyczy to przychodów, kosztów paliwa, emisji CO₂ i zużycia zasobów. **Efekt uboczny, który jest zaletą:** jeden zły dzień kosztuje jak jedenaście — stawka każdej decyzji rośnie.

**(2) Prawdopodobieństwo zdarzeń trzeba przeskalować ~10×.**
Skoro gramy 36 dni zamiast 365, to żeby zachować realistyczną częstotliwość roczną, prawdopodobieństwo zdarzenia *na grywalną dobę* musi być ~10× wyższe niż rzeczywiste dzienne. Zjawiska wielodniowe (Dunkelflaute, fala mrozów) **nie mogą być losowane per doba** — muszą być zdarzeniami miesięcznymi obejmującymi wszystkie 3 doby miesiąca, inaczej stracą charakter „ciągnącego się kryzysu".

### 2.2 Rozgrywka turowa — doba to 24 tury po godzinie

**DECYZJA: gra jest turowa.** Nie ma czasu rzeczywistego, nie ma pauzy, nie ma regulacji tempa.

```
1 tura  = 1 godzina czasu gry
1 doba  = 24 tury
```

**Dlaczego odeszliśmy od czasu rzeczywistego.** Wcześniejszy model zakładał 5-minutową dobę z pauzą, która nie zużywa budżetu. To była sprzeczność: skoro pauza jest darmowa i nieograniczona, **budżet czasu nigdy nie był prawdziwym ograniczeniem**, tylko sugestią tempa. Gracz pauzujący co krok już grał turowo, tylko w interfejsie udającym czas rzeczywisty. Tryb turowy usuwa udawanie.

**Co zyskujemy:**
- **Gęstość decyzji.** W czasie rzeczywistym większość kroków przelatywała bez żadnego wejścia gracza. Każda tura wymaga zatwierdzenia — nie ma tur „przespanych".
- **Martwa noc przestaje kosztować.** Nocne tury gracz zatwierdza szybko, bo nie ma w nich decyzji. Problem znika bez mechanizmu zmiennego tempa.
- **Spójność z warstwą strategiczną.** Budowa, lata, inwestycje są z natury turowe. Jednolita tura usuwa rozdarcie tonalne między taktyką a strategią.
- **Rozdzielczość godzinowa jest uczciwa wobec danych** — profile zapotrzebowania (§8) są natywnie godzinowe, więc krok półgodzinny i tak je interpolował.

**Co tracimy — świadomie:**
- **Presję czasu.** Prawdziwy dyspozytor pracuje z zegarem nad głową. Uczucie „częstotliwość leci, muszę działać TERAZ" znika. Awaria bloku przestaje być adrenaliną, a staje się zadaniem do przeliczenia.
- **Wrażenie narastania** — powolne słabnięcie wiatru było doświadczeniem ciągłym, teraz jest informacją skokową.

Napięcie musi więc pochodzić z innego źródła. Tym źródłem jest **niepewność prognozy** (§2.4).

**Konsekwencja techniczna:** przy turach godzinowych **rampy jednostek cieplnych przestają cokolwiek ograniczać**. Blok węglowy przy 1%/min pokonuje w godzinę 60% mocy znamionowej, czyli cały swój zakres roboczy. To nie kwestia strojenia, tylko fizyki. Ograniczenie przenosi się na **czas rozruchu i minimum techniczne**, czyli na *unit commitment* — klasyczny problem energetyki i ciekawszy niż gonienie rampą. Rampy zostają w modelu jako informacja, nie jako wyzwanie.

### 2.3 Struktura tury

```
┌────────────────────────────────────────────────────────────┐
│  FAZA 1 — PROGNOZA        (automatyczna)                   │
│  Gra pokazuje prognozę na najbliższe godziny, Z BŁĘDEM.    │
│  Wraz z horyzontem pasmo niepewności się rozszerza.        │
├────────────────────────────────────────────────────────────┤
│  FAZA 2 — DECYZJA         (gracz, bez limitu czasu)        │
│  Nastawy jednostek, magazyn, wymiana transgraniczna,       │
│  uruchomienia i odstawienia bloków, przełączenia w sieci.  │
├────────────────────────────────────────────────────────────┤
│  FAZA 3 — ROZSTRZYGNIĘCIE (animowane, ~1 s)                │
│  Rzeczywistość się rozgrywa: prawdziwa pogoda, rozpływ,    │
│  regulacja pierwotna, częstotliwość, awarie, SCO.          │
├────────────────────────────────────────────────────────────┤
│  FAZA 4 — RAPORT                                           │
│  Ile kosztowała pomyłka. Aktualizacja wyniku doby.         │
└────────────────────────────────────────────────────────────┘
```

**Faza 3 musi być pokazana, nie tylko podliczona.** To jest zabezpieczenie przed osunięciem się gry w arkusz kalkulacyjny. Częstotliwość ma realnie przejechać po skali, przeciążona linia zamigotać, SCO odciąć się na oczach gracza. Dramat przenosi się z „zdążę zareagować" na **„patrzę, jak rozstrzyga się mój zakład"**. Jeśli ta faza będzie tylko odświeżeniem liczb, mechanika umrze.

### 2.4 Prognoza z błędem — właściwe źródło napięcia

Gracz **nie widzi stanu bieżącego pogody**. Widzi prognozę, która się myli — dokładnie jak prawdziwy dyspozytor, który zamawia moce z wyprzedzeniem.

**Błąd prognozy rośnie z horyzontem** *(wartości wygenerowane z wzorów σ w [06 §8.6.2](06-model-astronomiczny-i-pogodowy.md) — tam jest model źródłowy)*:

| Horyzont | Wiatr | PV | Zapotrzebowanie |
|---|---|---|---|
| +1 h | ±6,2% mocy zainst. | ±5,0% | ±1,4% |
| +3 h | ±10,6% | ±9,0% | ±2,2% |
| +6 h | ±17,2% | ±15,0% | ±3,4% |
| +12 h | ±30,4% | ±27,0% | ±5,8% |

Trzy własności, które z tego wynikają i są sednem mechaniki:

1. **Zapotrzebowanie jest niemal pewne, pogoda nie.** Gracz może ufać prognozie popytu i musi zabezpieczać się przed prognozą wiatru. To zgodne z rzeczywistością.
2. **Prognoza godzinowa jest dokładna — trudne są decyzje wielogodzinne.** Przy +1 h gracz trafia niemal zawsze. Prawdziwy dylemat brzmi: *czy uruchomić blok gazowy teraz na szczyt oddalony o cztery godziny, skoro prognoza wiatru na tę godzinę ma pasmo ±120 MW?* Rozruch trwa godzinę, węgla — sześć. **To jest unit commitment i to jest właściwa gra.**
3. **Trudność bierze się z wariancji, nie z poziomu.** Potwierdził to pierwszy prototyp: grudzień ze skaczącym wiatrem okazał się trudniejszy niż Dunkelflaute z wiatrem stojącym na zerze. Przewidywalny niedobór jest łatwiejszy od nieprzewidywalnej obfitości.

**Dokładność prognozy jest kupowalna.** Inwestycje w systemy prognostyczne (mezoskalowy model pogody, telemetria farm, prognoza ansamblowa) zwężają pasmo błędu. To rzadki przypadek inwestycji, która nie dodaje ani megawata mocy, a mimo to realnie obniża koszty — bo pozwala trzymać mniejszą rezerwę. Dobry sposób, by nauczyć gracza, ile warta jest informacja.

### 2.5 Przewijanie tur

Bez tego budżet czasu się nie spina: 24 tury × ~15 s to 6 minut na dobę, czyli 72 godziny na kampanię 20-letnią.

Gracz dostaje **przewijanie sterowane przez siebie**:
- „przewiń do godziny X",
- „przewiń, aż coś się stanie" — zatrzymanie przy awarii, przekroczeniu progu częstotliwości, przeciążeniu linii albo zmianie bilansu przekraczającej zadany próg.

W turach przewijane nastawy pozostają bez zmian, więc przewijanie to świadome przyjęcie ryzyka, a nie darmowe pominięcie. Z przewijaniem realny budżet wraca do ~45–50 godzin na kampanię.

*(To jest turowy odpowiednik zmiennego tempa odrzuconego wcześniej — z tą różnicą, że steruje nim gracz, a nie gra.)*

### 2.6 Skracanie czasów budowy — zasada zachowania proporcji

Zgodnie z decyzją, czasy budowy zostają skrócone z lat na miesiące. Trzeba to zrobić ostrożnie, bo **cała strategiczna wartość gry polega na podejmowaniu decyzji w warunkach niepewności co do odległej przyszłości**. Jeśli wszystko buduje się w kilka miesięcy, planowanie długofalowe przestaje być wyzwaniem i druga mechanika gry znika.

**Zasada:** to nie bezwzględny czas budowy tworzy napięcie, tylko **stosunek czasu budowy do horyzontu, w którym zapotrzebowanie istotnie urośnie**. Dlatego skracając czasy budowy K-krotnie, należy K-krotnie podnieść roczne tempo wzrostu zapotrzebowania.

> Przykład dla K = 5:
> - Realnie: jądrowa 10 lat, wzrost 2%/rok → w chwili uruchomienia popyt jest o **22% wyższy** niż w chwili decyzji.
> - W grze: jądrowa 2 lata, wzrost 10%/rok → 1,10² = **+21%**. Niemal identyczny zakład, przeżyty 5× szybciej.

**Proponowane czasy budowy (K ≈ 5, wzrost zapotrzebowania ~10%/rok):**

| Technologia | Realnie | W grze | W dobach gry |
|---|---|---|---|
| Jądrowa | 8–12 lat | **2 lata** | 72 doby (~6 h) |
| Węgiel / szczytowo-pompowa | 5–6 lat | **1 rok** | 36 dób (~3 h) |
| Wiatr morski | 4–6 lat | **10 miesięcy** | 30 dób (~2,5 h) |
| Gaz CCGT | 2–3 lata | **6 miesięcy** | 18 dób (~1,5 h) |
| Linia 400 kV (długa) | 5–8 lat | **9 miesięcy** | 27 dób |
| Linia 110 kV, stacja | 2–3 lata | **3–4,5 miesiąca** | 9–14 dób |
| Gaz OCGT, wiatr lądowy | 1–2 lata | **3 miesiące** | 9 dób |
| PV, bateria (BESS) | <1 rok | **1–1,5 miesiąca** | 3–5 dób |

*(Uwaga strojeniowa: przy 3 dobach na miesiąc najkrótszy sensowny czas budowy to ~1 miesiąc — PV i BESS są już przy tym dnie. Dalsze skracanie czasów globalnych nie jest możliwe bez zmiany modelu czasu.)*

Zachowana jest **kolejność względna** — to ona tworzy strategię. Dodatkowo, żeby decyzja inwestycyjna nadal „bolała" mimo krótszego oczekiwania: wysoka płatność początkowa, **kary za anulowanie budowy** i rosnąca niepewność prognozy wraz z horyzontem.

### 2.7 Długość kampanii i zawór bezpieczeństwa

Przy turach z przewijaniem (§2.5) kampania 20-letnia to ~45–50 godzin. Propozycja wariantów: **krótka 10 lat (~25 h)**, **standardowa 20 lat (~48 h)**, **długa 30+ lat**.

Dodatkowo warto zachować **auto-dyspozycję jako opcję, nie jako regułę**: gdy system jest stabilny i dobrze rozbudowany, doby robocze stają się powtarzalne. Gracz powinien móc kliknąć „przewiń tę dobę" i pozwolić automatowi ją rozegrać według skonfigurowanych reguł. Automat celowo osiąga gorszy wynik finansowy niż dobry gracz (np. −10…15% marży) — to zawór bezpieczeństwa przeciw znużeniu, a nie droga na skróty.

---

## 3. Świat gry — mapa heksagonalna

### 3.1 Struktura

- Mapa to siatka heksagonalna o konfigurowalnym rozmiarze (np. `24×16` — mapa mała, `48×32` — średnia, `96×64` — duża). Rozmiar wpływa na skalę kraju, długości linii i tempo rozgrywki.
- Zalecana orientacja: **flat-top**, współrzędne **osiowe (axial q,r)** — prosty przelicznik odległości i sąsiedztwa.
- **DECYZJA:** jeden heks reprezentuje obszar **25×25 km** — na tyle duży, żeby pomieścić duże miasto wraz z otoczeniem. Przelicznik km/heks pozostaje parametrem mapy (domyślnie 25) i wprost przekłada się na koszt oraz straty linii.

### 3.2 Właściwości heksa

| Cecha | Wpływ na rozgrywkę |
|---|---|
| **Typ terenu** (nizina, wyżyna, góry, las, bagno, jezioro, morze, teren zurbanizowany) | mnożnik kosztu budowy linii i obiektów, czas budowy |
| **Wysokość n.p.m.** | koszt budowy, potencjał wiatru |
| **Potencjał wiatru** (średnia prędkość) | produktywność farm wiatrowych |
| **Nasłonecznienie** | produktywność PV |
| **Ciek wodny / przepływ** | możliwość budowy elektrowni wodnej, chłodzenie bloków cieplnych |
| **Różnica wysokości + woda** | możliwość budowy elektrowni szczytowo-pompowej |
| **Złoża** (węgiel kamienny, brunatny, gaz) | tania elektrownia „przy kopalni", brak kosztów transportu paliwa |
| **Ograniczenia** (park narodowy, teren wojskowy, zabudowa) | zakaz lub podwyższony koszt / opór społeczny |
| **Zawartość** | miasto, elektrownia, stacja, punkt graniczny |

### 3.3 Obiekty punktowe i liniowe

- **Punktowe** (zajmują heks): elektrownie, stacje elektroenergetyczne, magazyny, miasta, punkty graniczne (na krawędzi mapy).
- **Liniowe** (biegną przez łańcuch heksów): linie napowietrzne i kablowe. Koszt = suma kosztów heksów na trasie × mnożnik terenu. Trasowanie robi gracz albo automat („najtańsza trasa"), z możliwością ręcznej korekty.

### 3.4 Stan początkowy — start greenfield

**DECYZJA: gracz zaczyna od zera.** Na mapie nie ma żadnej infrastruktury — ani elektrowni, ani linii, ani stacji.

Rodzi to problem, którego reszta dokumentu milcząco nie przewidywała: jeśli miasta istnieją od pierwszej doby i wymagają zasilania, gracz przegrywa, zanim zdąży cokolwiek zbudować. Rozwiązanie:

**Miasta istnieją na mapie, ale startują jako niepodłączone.**

- Miasto niepodłączone nie generuje przychodu i nie wlicza się do bilansu. Nie jest też karą — po prostu jeszcze nie jest klientem.
- **Przyłączenie miasta jest aktem gracza**: doprowadź linię, postaw stację, załącz. Od tego momentu miasto płaci za energię, ale też **trwale dokłada się do zapotrzebowania i do ryzyka**.
- Przychód pojawia się dopiero po przyłączeniu, więc naturalną strategią otwarcia jest: jedna elektrownia + najbliższe miasto → pierwszy przepływ gotówki → rozbudowa.

**Dlaczego to dobrze działa razem z modelem czasu z sekcji 2.1:**

Model „720 dób granych ręcznie" niesie ryzyko przytłoczenia gracza na starcie. Greenfield rozwiązuje to sam z siebie — pierwsze miesiące to system złożony z **jednej elektrowni i jednego miasta**. Doba jest wtedy trywialna: 24 tury, w których gracz niemal wyłącznie przewija, bo nie ma czego bilansować. Złożoność narasta dokładnie w tempie, w jakim gracz sam ją buduje.

To zastępuje osobny samouczek: **krzywa trudności jest emergentna, wynika z tempa rozbudowy, a nie z zaprojektowanych poziomów.**

**DECYZJA: kapitał startowy = 10 mld zł** — parametr konfiguracji scenariusza (poziom trudności może go zmieniać). Kwota przy realistycznych cenach domyka otwarcie „pierwsza elektrownia + linia + stacja + przyłączenie pierwszego miasta" (np. CCGT ~500 MW to ~4–5 mld zł) z zapasem na drugą inwestycję. Weryfikacja w dokumencie 03: kapitał nie może być na tyle duży, żeby zdejmować napięcie finansowe z pierwszych lat.

**DECYZJA: skala systemu** — nie jest zadana z góry, tylko **wynika z liczby przyłączonych miast, ich mieszkańców i przemysłu**. Orientacyjnie: ~1 GW szczytu w pierwszych latach po starcie, **20–30 GW** w późnej grze. Ta rozpiętość (×20–30) bierze się z złożenia wzrostu zapotrzebowania ~10%/rok (§2.6) i przyłączania kolejnych miast; determinuje wielkości bloków (od dziesiątek MW na starcie po bloki 1000+ MW) i rząd wielkości finansów w dokumencie 03.

**Konsekwencje do rozstrzygnięcia w dokumencie 03:**
- Czy pierwsza inwestycja jest finansowana kredytem (realistyczne, ale ryzykowne na starcie), czy wyłącznie kapitałem startowym.
- Czy niepodłączone miasta generują presję (opinia publiczna, rząd), czy czekają cierpliwie. **Propozycja: cierpliwie na początku, presja narasta po kilku latach** — inaczej gracz jest karany za coś, na co nie ma jeszcze pieniędzy.
- Czy istnieje mechanizm „miasto zasilane awaryjnie z generatorów", czyli stan pośredni: działa, ale drogo i brudno.

---

## 4. Model elektryczny — rdzeń symulacji

To serce gry. Proponuję trzy poziomy szczegółowości, przełączane poziomem trudności / trybem:

| Poziom | Model | Co daje |
|---|---|---|
| **Arcade** | prosty bilans energii, sieć jako graf przepustowości | łatwy start, brak fizyki rozpływów |
| **Standard** ✅ **przyjęty** | **DC power flow** — rozpływ wyznaczany przez reaktancje linii | realne przeciążenia, zatory, przepływy kołowe, straty |
| **Symulacja** | uproszczony **AC power flow** — moc czynna + bierna, napięcia węzłowe | pełna mechanika napięcia, kompensacja mocy biernej |

**DECYZJA: budujemy na DC power flow, począwszy od prototypu.** Jest tani obliczeniowo (rozwiązanie układu liniowego), a daje najważniejszą właściwość: gracz nie może zdecydować, którą linią popłynie prąd. Arcade i Symulacja pozostają jako ewentualne poziomy trudności na później.

### 4.1 Częstotliwość vs napięcie — dwie różne rzeczy

To rozróżnienie warto wprowadzić świadomie, bo daje dwie osobne, ciekawe mechaniki:

**Częstotliwość (50 Hz) — miara bilansu mocy czynnej w CAŁYM systemie.**
Jedna liczba dla całego kraju. Rośnie, gdy produkcja przewyższa zużycie; spada, gdy jest odwrotnie. To główny wskaźnik „czy gram dobrze".

| Zakres | Stan | Konsekwencje |
|---|---|---|
| 49,95 – 50,05 Hz | normalny | wszystko OK |
| 49,80 – 49,95 Hz | podwyższona czujność | ostrzeżenie, uruchomienie rezerwy |
| 49,50 – 49,80 Hz | alarm | automatyczna rezerwa, kara jakościowa |
| 49,00 – 49,50 Hz | zagrożenie | **automatyczne odłączanie odbiorów (SCO)** |
| < 48,50 Hz | krytyczny | kaskadowe odłączanie bloków → **blackout** |
| > 50,20 Hz | nadmiar | odłączanie generacji, straty finansowe |

**Napięcie — zjawisko LOKALNE, wynik bilansu mocy biernej w danym węźle.**
Każda stacja ma własne napięcie. Spada, gdy do węzła dociera za mało mocy biernej lub gdy linie są przeciążone. Za niskie napięcie w regionie = pogorszona jakość dostaw, kary, ryzyko lawiny napięciowej. Reguluje się przez: przełączniki zaczepów transformatorów, baterie kondensatorów, dławiki, generatory pracujące w trybie kompensacji.

### 4.2 Inercja systemu

Wirujące masy turbin (bloki węglowe, gazowe, jądrowe, wodne) magazynują energię kinetyczną i **spowalniają zmiany częstotliwości**. Farmy wiatrowe, PV i baterie podłączone przez falowniki nie dają inercji naturalnej.

Mechanika: im większy udział źródeł bezinercyjnych, tym szybciej spada częstotliwość po awarii — gracz ma mniej czasu na reakcję. To naturalny, realistyczny „koszt ukryty" transformacji energetycznej i świetny mid/late-game challenge. Przeciwdziałanie: kompensatory synchroniczne, baterie z *grid-forming inverter*, utrzymywanie części bloków w ruchu na minimum technicznym.

### 4.3 Rezerwy mocy

Gracz musi trzymać wolną moc na wypadek awarii — to koszt, który nie generuje przychodu, ale jego brak kończy się blackoutem.

| Rodzaj rezerwy | Czas aktywacji | Typowe źródło |
|---|---|---|
| **Pierwotna (FCR)** | sekundy | regulatory turbin, baterie |
| **Wtórna (aFRR)** | do 5 minut | bloki w ruchu, wodne, baterie |
| **Trójna (mFRR)** | 15–30 minut | turbiny gazowe OCGT, szczytowo-pompowe |
| **Zimna** | godziny | bloki w postoju |

Reguła kciuka do zaimplementowania: rezerwa ≥ moc największej pracującej jednostki (kryterium największego pojedynczego zakłócenia).

### 4.4 Straty przesyłowe

Straty w linii rosną z kwadratem prądu: `P_strat = 3·I²·R`. Praktyczna konsekwencja dla gracza:

- Przesyłanie tej samej mocy na wyższym napięciu = drastycznie mniejsze straty (mniejszy prąd).
- Długie linie 110 kV do odległych miast = wyciek pieniędzy.
- Straty zależą od obciążenia — linia mocno obciążona traci nieproporcjonalnie więcej.

Docelowe wartości referencyjne: sieć przesyłowa ~1,5–2,5%, dystrybucyjna ~5–7%, łącznie ~7–9% energii wprowadzonej.

### 4.5 Kryterium N-1

Fundament planowania sieci: **system musi przetrwać awarię dowolnego pojedynczego elementu** (linii, transformatora, bloku) bez utraty zasilania odbiorców.

W grze: osobny widok analityczny pokazujący, które elementy sieci są „krytyczne" (ich utrata powoduje wyłączenia). Regulator wymaga spełnienia N-1 w rosnącym procencie węzłów — to główny driver rozbudowy sieci, niezależny od samego wzrostu zapotrzebowania. Bez tego gracz budowałby minimalną sieć i grał na krawędzi.

---

## 5. Poziomy napięć i hierarchia sieci

Sieć ma warstwy. To odpowiedź na pytanie „czy stacje rozdzielczo-transformatorowe są potrzebne" — **tak, są niezbędne i są jednym z ciekawszych elementów decyzyjnych.**

| Poziom | Napięcie | Rola | Typowa przepustowość |
|---|---|---|---|
| Najwyższe (NN) | 400 kV | „autostrady" — przesył międzyregionalny i graniczny | 1200–2500 MW / tor |
| Wysokie (WN) | 220 kV | starsza warstwa przesyłowa | 400–600 MW |
| Wysokie (WN) | 110 kV | zasilanie regionów i dużego przemysłu | 100–200 MW |
| Średnie (SN) | 15 kV | rozdział wewnątrz miasta | 5–15 MW |
| Niskie (nN) | 0,4 kV | odbiorcy końcowi | *abstrahowane* |

**Uproszczenie projektowe:** poziom nN (0,4 kV) nie jest modelowany indywidualnie — miasto agreguje wszystkich odbiorców końcowych. Modelujemy 400 / 220 / 110 / 15 kV.

### 5.1 Rola stacji elektroenergetycznych

Stacja to jedyne miejsce, gdzie spotykają się dwa poziomy napięcia. Bez niej moc z linii 400 kV nie trafi do miasta. Stacje dają graczowi kilka niezależnych decyzji:

- **Moc transformatorów [MVA]** — ograniczenie przepustowości niezależne od linii. Klasyczna pułapka: gracz buduje grubą linię, a wąskim gardłem zostaje transformator.
- **Układ rozdzielni** — pojedynczy system szyn (tani, ale awaria szyn = cała stacja w ciemnościach) / podwójny system szyn / układ półtorawyłącznikowy (drogi, ale odporny). To jest N-1 na poziomie stacji.
- **Kompensacja mocy biernej** — baterie kondensatorów i dławiki regulujące napięcie lokalnie.
- **Automatyka i telemechanika** — poziom ulepszenia decyduje o tym, jak szybko stacja reaguje na zakłócenia i czy da się nią sterować zdalnie (czy dyspozytor musi wysłać ekipę).
- **Węzeł sieci** — stacja jest punktem, do którego przyłącza się miasto, elektrownia albo kolejna linia. Rozbudowa pól liniowych w stacji jest osobnym kosztem.

---

## 6. Wytwarzanie — typy elektrowni

Każdy typ ma inny profil kosztowy i inne ograniczenia techniczne. To właśnie ograniczenia techniczne robią z bilansowania grę, a nie arkusz kalkulacyjny.

### 6.1 Parametry każdej jednostki

- **Moc zainstalowana** [MW] i **minimum techniczne** [% mocy] — blok węglowy nie zejdzie poniżej ~40%, więc w nocy przy nadmiarze wiatru trzeba go wyłączyć albo dopłacić.
- **Szybkość zmiany mocy (ramp rate)** [MW/min] — ile gracz może dołożyć w 15 minut.
- **Czas rozruchu** — zimny / ciepły / gorący start (blok węglowy: 6–10 h z zimnego, OCGT: 5–10 min).
- **Minimalny czas pracy i postoju** — nie da się włączać i wyłączać bloku co godzinę.
- **Koszt zmienny** [zł/MWh] = paliwo + CO₂ + eksploatacja zmienna. Wyznacza pozycję w merit order.
- **Koszt stały** [zł/MW/rok] — płacony niezależnie od produkcji.
- **CAPEX** [zł/MW] i **czas budowy**.
- **Dyspozycyjność** — awaryjność, remonty planowane.
- **Emisje CO₂** i **inne** (pyły, SO₂, NOₓ) — wpływ na koszty i na akceptację społeczną.
- **Inercja (stała H)** — wkład w stabilność częstotliwości.
- **Zdolność black-start** — czy jednostka potrafi wystartować bez zasilania z sieci.

### 6.2 Katalog technologii (wartości orientacyjne do strojenia)

| Technologia | CAPEX | Budowa | Koszt zmienny | Ramp | Min. tech. | Rola |
|---|---|---|---|---|---|---|
| **Jądrowa** | b. wysoki | 8–12 lat | b. niski | b. wolny | 80% | podstawa, dużo inercji |
| **Węgiel brunatny** | wysoki | 5–6 lat | niski | wolny | 45% | podstawa, duże emisje |
| **Węgiel kamienny** | średni-wys. | 4–5 lat | średni | wolny | 40% | podstawa/podszczyt |
| **Gaz CCGT** | średni | 2–3 lata | wysoki (zal. od gazu) | szybki | 40% | podszczyt, elastyczność |
| **Gaz OCGT** | niski | 1–2 lata | b. wysoki | b. szybki | 20% | szczyt, rezerwa |
| **Wodna przepływowa** | wysoki | 4–6 lat | ~0 | b. szybki | 0% | elastyczność, sezonowa |
| **Szczytowo-pompowa** | b. wysoki | 6–8 lat | ~0 (sprawność ~75%) | b. szybki | — | magazyn + rezerwa |
| **Wiatr na lądzie** | średni | 1–2 lata | ~0 | niesterowalna | — | tania energia, zmienna |
| **Wiatr na morzu** | wysoki | 4–6 lat | ~0 | niesterowalna | — | wyższa dyspozycyjność |
| **PV** | niski | <1 rok | ~0 | niesterowalna | — | szczyt dzienny, zero w nocy |
| **Biomasa / biogaz** | średni | 2–3 lata | wysoki | średni | 40% | sterowalne OZE |
| **Bateria (BESS)** | średni | <1 rok | ~0 (sprawność ~90%) | natychmiast | — | rezerwa, arbitraż |

### 6.3 Merit order i cena energii

Jednostki uruchamiane są w kolejności rosnącego kosztu zmiennego. **Cena rynkowa w danej godzinie = koszt zmienny najdroższej pracującej jednostki** (cena krańcowa). Tanie źródła zarabiają różnicę między swoim kosztem a ceną krańcową — to główny mechanizm zysku.

Konsekwencje dla gracza, które warto, żeby odkrył sam:
- Dołożenie taniego OZE obniża cenę rynkową — i tym samym marżę własnych elektrowni konwencjonalnych (efekt *merit order*).
- Elektrownia szczytowa pracuje 200 h w roku, ale w tych godzinach zarabia krocie.
- Magazyn zarabia na różnicy cen: ładuj w nocy tanio, sprzedawaj w szczyt drogo (arbitraż).

---

## 7. Magazyny energii

| Typ | Pojemność | Czas rozładowania | Sprawność | Uwagi |
|---|---|---|---|---|
| **Szczytowo-pompowa** | duża | 6–20 h | ~75% | wymaga terenu: różnica wysokości + woda |
| **Bateria litowa** | mała-średnia | 1–4 h | ~90% | degradacja z liczbą cykli, wszędzie |
| **Wodór (P2G2P)** | b. duża | dni–tygodnie | ~35% | magazyn sezonowy, drogi |
| **Magazyn ciepła (CHP)** | — | godziny | — | odsprzęga produkcję prądu od ciepła |

Kluczowy parametr rozróżniający: **moc [MW] vs pojemność [MWh]**. Bateria 100 MW / 200 MWh oddaje pełną moc przez 2 godziny. Gracze często mylą te rzeczy — UI musi to wyraźnie pokazywać.

---

## 8. Odbiorcy — miasta i profile zużycia

### 8.1 Struktura miasta

Każde miasto ma: liczbę mieszkańców, klasę wielkości, tempo wzrostu i skład odbiorców. Zapotrzebowanie miasta = suma profili jego segmentów.

| Segment | Charakterystyka poboru | Wrażliwość na cenę | Skutek przerwy |
|---|---|---|---|
| **Gospodarstwa domowe** | dwa szczyty: poranny (6–9) i wieczorny (17–22, dominujący); głęboka dolina nocna | niska | bardzo zły odbiór społeczny |
| **Usługi / handel / biura** | płaski wysoki poziom 8–18, w weekend niższy | średnia | straty finansowe, skargi |
| **Przemysł ciężki** | prawie płaski 24/7, mała zmienność | wysoka (negocjuje taryfę) | ogromne kary umowne |
| **Przemysł jednozmianowy** | prostokąt 6–14 w dni robocze | średnia | straty produkcyjne |
| **Transport / kolej / trakcja** | szczyty komunikacyjne, duże skoki | niska | paraliż |
| **Data center** *(późna gra)* | całkowicie płaski, rosnący | wysoka | kary SLA |
| **Rolnictwo / nawadnianie** | sezonowy, letni | wysoka | straty w zbiorach |

Sumaryczny profil dobowy kraju to złożenie tych krzywych. Ładne w tym jest to, że gracz musi zrozumieć **strukturę** swojego zapotrzebowania, a nie tylko jego wielkość — miasto przemysłowe i miasto sypialne o tej samej mocy szczytowej wymagają zupełnie innego portfela wytwórczego.

### 8.2 Czynniki modyfikujące zapotrzebowanie

- **Pora dnia** — profil godzinowy (rozdzielczość 1 h, zgodna z turą — §2.2).
- **Dzień tygodnia** — weekend −15…25%.
- **Sezon** — zima: ogrzewanie i oświetlenie; lato: klimatyzacja (rosnąca w czasie).
- **Temperatura** — poniżej ~15°C zapotrzebowanie rośnie liniowo; powyżej ~22°C również (klimatyzacja). Klasyczna krzywa „V".
- **Święta** — dni świąteczne mają własny, wypłaszczony profil.
- **Wydarzenia** — mecz, transmisja telewizyjna: nagły skok („TV pickup").
- **Wzrost gospodarczy** — realnie długofalowy trend +1…3% rocznie; w grze przeskalowany przez K ≈ 5 do łącznego wzrostu zapotrzebowania ~10%/rok (§2.6).
- **Elektryfikacja** — pojazdy elektryczne i pompy ciepła: strukturalna zmiana profilu w późnej grze (nowy szczyt nocny od ładowania, wyższy szczyt zimowy od pomp ciepła).
- **Efektywność energetyczna** — programy termomodernizacji, LED-y: obniżają zapotrzebowanie, kosztują.
- **Generacja rozproszona** — prosumenci z PV na dachach: obniżają zapotrzebowanie w środku dnia, tworząc „krzywą kaczki" (*duck curve*) i problem stromej rampy wieczornej.

---

## 9. Mechanika I — bilansowanie doby (warstwa taktyczna)

### 9.1 Przebieg doby

Doba to **24 tury po godzinie** (§2.2). Struktura pojedynczej tury opisana w §2.3.

**Przed dobą — plan pracy jednostek**
Gracz otrzymuje prognozę dobową (z błędem rosnącym z horyzontem, §2.4), listę jednostek niedostępnych z powodu remontów i awarii oraz ceny na rynkach sąsiadów. Układa wstępny **unit commitment**: które bloki startują i kiedy, ile rezerwy trzymać, jak sterować magazynem.

**W każdej turze**
1. Gracz widzi prognozę na najbliższe godziny — nie stan rzeczywisty.
2. Ustawia nastawy: moce jednostek, magazyn, wymiana transgraniczna, uruchomienia i odstawienia bloków, przełączenia w sieci.
3. Zatwierdza turę.
4. Symulacja wyznacza **rzeczywiste** zapotrzebowanie i produkcję OZE — różne od prognozy.
5. Regulacja pierwotna reaguje automatycznie, w granicach dostępnego zapasu.
6. Rozwiązywany jest rozpływ mocy → obciążenia linii, straty.
7. Uchyb resztkowy wyznacza częstotliwość.
8. Zdarzenia: awaria bloku, wyłączenie linii, wyłączenie sztormowe turbin.
9. Poniżej 49,0 Hz automatyka odłącza odbiory (SCO).

W ostateczności gracz może **redukować odbiory świadomie** — płatne, ale tańsze niż niekontrolowane zadziałanie SCO i nieporównanie tańsze niż blackout.

**Po dobie — rozliczenie**
Przychody ze sprzedaży, koszty paliwa i CO₂, wynik handlu transgranicznego, kary jakościowe, wskaźniki: odchylenie częstotliwości, maksymalne obciążenie linii, energia niedostarczona, **trafność własnych prognoz**.

### 9.2 Stany awaryjne i kaskada

Realistyczna spirala, którą gra powinna odwzorować:

```
Awaria bloku 800 MW
   ↓
Spadek częstotliwości (tempo zależy od inercji systemu)
   ↓
Rezerwa pierwotna hamuje spadek → rezerwa wtórna przywraca 50 Hz
   ↓  (jeśli rezerwy nie starczy)
Częstotliwość < 49,0 Hz → automatyczne odłączanie odbiorów (SCO)
   ↓  (jeśli to nie wystarczy)
Przeciążenie linii przejmujących przepływ → zadziałanie zabezpieczeń
   ↓
Kolejne przeciążenia → KASKADA → BLACKOUT (całkowity lub obszarowy)
   ↓
Odbudowa systemu: black start → wyspy → synchronizacja wysp → normalna praca
   (godziny/dni, gigantyczne straty, kryzys polityczny)
```

Blackout to nie *game over*, lecz bardzo bolesna, zapamiętywalna porażka: utrata przychodów, kary, spadek reputacji, dochodzenie regulatora, ewentualnie dymisja.

---

## 10. Mechanika II — rozbudowa długofalowa (warstwa strategiczna)

### 10.1 Cykl inwestycyjny

```
Analiza prognozy (5/10/20 lat)
   → Wybór lokalizacji i technologii
   → Studium wykonalności (koszt, czas, ryzyko)
   → Decyzja środowiskowa / opór społeczny
   → Finansowanie (kapitał własny / kredyt / obligacje / dotacja)
   → BUDOWA (lata, ryzyko opóźnień i przekroczenia budżetu)
   → Rozruch i testy
   → Eksploatacja (koszty stałe, remonty, starzenie)
   → Modernizacja / przedłużenie życia / wyłączenie i rozbiórka
```

Kluczowe napięcie strategiczne: **elektrownia jądrowa decyzją dziś zacznie produkować za 2 lata gry (72 doby, ~6 h przy stole)** — a zapotrzebowanie rośnie o ~10% rocznie już teraz. Gracz musi planować w horyzoncie znacznie dłuższym niż horyzont pewności prognozy. Czasy budowy i skalowanie tempa wzrostu — patrz sekcja 2.6.

**Kary za anulowanie budowy** są istotnym elementem: rozpoczętej inwestycji nie da się porzucić bez kosztu (im dalej zaawansowana, tym drożej). Bez tego gracz mógłby bezkarnie „obstawiać" wszystkie warianty naraz.

### 10.2 Rozbudowa istniejących obiektów

Nie każda inwestycja to nowa lokalizacja. Istniejący obiekt można rozbudować — to druga, często lepsza ścieżka zwiększania mocy:

| Obiekt | Co można rozbudować | Twardy limit |
|---|---|---|
| **Elektrownia cieplna / jądrowa** | kolejne bloki na tym samym terenie | 4–6 bloków (teren, dostępność wody chłodzącej) |
| **Farma wiatrowa** | dodatkowe turbiny | 3–4 poziomy; każdy kolejny −5…10% produktywności (efekt zacienienia aerodynamicznego) |
| **Farma PV** | dodatkowe panele | powierzchnia heksa |
| **Magazyn (BESS)** | moc [MW] i pojemność [MWh] **osobno** (por. §7) | limit modułów na heks |
| **Szczytowo-pompowa** | dodatkowe hydrozespoły (moc) | zbiornik (pojemność) zwykle nie do powiększenia — geologia |
| **Stacja** | transformatory, pola liniowe, układ rozdzielni | rozmiar rozdzielni |

**Dlaczego rozbudowa się opłaca:**
- **Krótszy czas budowy** — ~60–75% czasu wariantu greenfield: teren przygotowany, przyłącze istnieje, procedury administracyjne uproszczone.
- **Niższy CAPEX** — ~10–20% oszczędności na współdzielonej infrastrukturze (stacja, drogi, plac budowy).
- **Mniejsze ryzyko** — znana lokalizacja, znane warunki gruntowe, opór społeczny już „przerobiony" przy pierwszej budowie.

**Dlaczego nie w nieskończoność — limity twarde i miękkie:**

1. **Pojemność lokalizacji.** Każdy obiekt ma maksymalny poziom rozbudowy wynikający z heksa: powierzchnia, woda chłodząca, geologia. Po osiągnięciu limitu jedyną drogą jest nowa lokalizacja.
2. **Malejące przychody krańcowe.** Na farmie wiatrowej kolejne turbiny zabierają sobie wiatr (wake effect) — zagęszczanie ma coraz gorszy zwrot i w pewnym momencie nowa lokalizacja wygrywa rachunkiem, zanim wygra limitem.
3. **Przyłącze jako wąskie gardło.** Rozbudowa źródła często wymaga rozbudowy stacji i linii odprowadzającej. Ten ukryty koszt ujawnia się w studium wykonalności i potrafi zjeść całą oszczędność z rozbudowy.
4. **Ryzyko koncentracji.** Im większy obiekt, tym większa pojedyncza awaria: rezerwa musi pokrywać największą pracującą jednostkę (§4.3), a utrata jednego przyłącza odcina całość (N-1, §4.5). System z trzech gigantycznych lokalizacji jest tańszy, ale kruchszy od rozproszonego.
5. **Opór społeczny narasta z rozmiarem** — trzeci blok przechodzi gładko, szósty wywołuje protesty i podnosi koszty (§13).

Nowy blok w starej elektrowni ma **własny wiek i stan techniczny** — starzenie się majątku (§10.4) liczy się per jednostka, nie per lokalizacja. Rozbudowa starej lokalizacji nie odmładza jej pierwszych bloków.

### 10.3 Kolejka przyłączeniowa

Nowi duzi odbiorcy (fabryka, data center) i nowe źródła składają **wnioski o przyłączenie**. Gracz wydaje (lub odmawia) warunki przyłączenia — ale musi sprawdzić, czy sieć w tym miejscu wytrzyma. Odmowa = utrata przychodu i zła prasa. Zgoda bez rozbudowy = przeciążenia. To elegancki sposób na wymuszenie planowania sieci, a nie tylko wytwarzania.

### 10.4 Starzenie się majątku

Każdy element ma wiek i stan techniczny. Wraz z wiekiem: rośnie awaryjność, rosną koszty utrzymania, spada sprawność. Gracz planuje **remonty** (jednostka niedostępna przez X dni — najlepiej latem, gdy zapotrzebowanie jest niższe) i decyduje o modernizacji lub wyłączeniu.

Remonty planowane to osobna mini-łamigłówka: trzeba je rozłożyć w roku tak, żeby nigdy nie zabrakło mocy.

### 10.5 Wektory rozwoju technologicznego

Postęp odblokowuje nowe opcje wraz z upływem lat (i/lub inwestycjami w B+R):
- coraz tańsze i wydajniejsze PV, wiatr, baterie,
- linie prądu stałego HVDC (przesył na duże odległości z małymi stratami, sterowalny przepływ — obchodzi ograniczenia fizyki AC),
- inteligentne sieci, sterowanie stroną popytu (DSR), liczniki zdalne,
- wodór, magazyny sezonowe, SMR-y (małe reaktory modułowe),
- lepsze prognozowanie (mniejszy błąd prognozy = mniejsza wymagana rezerwa = niższy koszt).

---

## 11. Wymiana transgraniczna

### 11.1 Sąsiedzi

Na krawędziach mapy znajdują się **punkty graniczne** prowadzące do 3–5 krajów sąsiednich. Każdy sąsiad ma własną, symulowaną (uproszczoną) charakterystykę:

- profil cen energii w ciągu doby i roku,
- strukturę wytwarzania (sąsiad wiatrowy ma tanio przy wietrze; sąsiad jądrowy ma stabilnie),
- własne okresy niedoborów — **gdy im brakuje, zwykle brakuje też nam** (ta sama pogoda!),
- stosunki polityczne wpływające na dostępną przepustowość i ceny.

### 11.2 Mechanika

- Budowa **połączenia transgranicznego (interkonektora)** — bardzo droga inwestycja, wymaga zgody obu stron, długo trwa.
- **NTC** — maksymalna zdolność przesyłowa udostępniona handlowi (mniejsza niż fizyczna przepustowość, bo trzeba zostawić margines bezpieczeństwa).
- Gracz ustawia harmonogram importu/eksportu na dobę; może go korygować w trakcie.
- **Import** ratuje w szczycie, ale uzależnia i kosztuje. **Eksport** to czysty zysk z nadwyżek, które inaczej trzeba by zmarnować.
- **Przepływy nieplanowe (kołowe)** — energia handlowana między sąsiadami fizycznie płynie przez naszą sieć, obciążając nasze linie bez naszej zgody. Świetny „niesprawiedliwy" problem do rozwiązania (przesuwniki fazowe).
- **Ryzyko polityczne**: sąsiad może z dnia na dzień ograniczyć eksport w kryzysie. Strategia oparta wyłącznie na imporcie jest krucha.

---

## 12. Ekonomia

**DECYZJA: walutą gry jest złoty (PLN).** Wszystkie wartości w dokumentach podajemy w złotówkach. Waluta jest parametrem konfiguracji (etykieta + kurs przeliczeniowy), więc zmiana na euro albo jednostkę abstrakcyjną nie dotyka mechaniki.

### 12.1 Przychody

| Źródło | Charakterystyka |
|---|---|
| **Taryfa gospodarstw domowych** | regulowana — gracz proponuje, regulator zatwierdza; podwyżka = spadek zadowolenia |
| **Sprzedaż odbiorcom biznesowym** | kontrakty negocjowane, wolumen i cena, kary za niedostarczenie |
| **Kontrakty długoterminowe (PPA)** | stała cena na lata — bezpieczeństwo kosztem potencjalnego zysku |
| **Eksport energii** | cena rynkowa sąsiada minus koszty |
| **Opłaty przesyłowe i dystrybucyjne** | za korzystanie z sieci |
| **Usługi systemowe** | opłata za gotowość / rezerwę (rynek mocy) |
| **Opłaty przyłączeniowe** | jednorazowe, od nowych odbiorców |

### 12.2 Koszty

Paliwo (ceny zmienne w czasie, ryzyko cenowe) · uprawnienia do emisji CO₂ (rosnące) · koszty stałe eksploatacji · remonty i modernizacje · obsługa długu · import energii · **kary** (energia niedostarczona, przekroczenie parametrów jakościowych, niedotrzymanie celów OZE) · podatki lokalne.

### 12.3 Finansowanie

- **Kapitał własny** — z zysku, bez odsetek, ale wolno się gromadzi.
- **Kredyt** — szybko, ale odsetki zależne od ratingu (im większe zadłużenie, tym drożej).
- **Obligacje** — większe kwoty, dłuższy termin.
- **Dotacje i wsparcie** — dostępne dla wybranych technologii zgodnych z polityką państwa (np. OZE, jądrowa).
- **Bankructwo** — przekroczenie limitu zadłużenia przy braku zdolności obsługi długu = przegrana.

### 12.4 Wskaźnik kosztu — LCOE

Warto pokazywać graczowi **uśredniony koszt energii (LCOE)** dla każdej rozważanej inwestycji, uwzględniający CAPEX, koszty stałe i zmienne oraz przewidywane wykorzystanie. To narzędzie porównawcze, którego naprawdę używa się w branży, i uczy gracza, że „tania w budowie" ≠ „tania w eksploatacji".

---

## 13. Regulator, polityka i społeczeństwo

Warstwa nadająca decyzjom kontekst i zapobiegająca czysto optymalizacyjnej rozgrywce.

**Regulator** narzuca i weryfikuje:
- wskaźniki niezawodności: **SAIDI** (średni czas przerw na odbiorcę w roku), **SAIFI** (średnia liczba przerw), **ENS** (energia niedostarczona),
- parametry jakościowe: częstotliwość, poziomy napięć, spełnienie N-1,
- zatwierdzanie taryf (uzasadniony koszt + regulowana marża),
- cele udziału OZE i limity emisji, rosnące z upływem lat.

**Rząd** wyznacza politykę energetyczną (może się zmienić po wyborach — zmiana kursu w połowie inwestycji to realistyczne i bolesne wydarzenie), przyznaje dotacje, może narzucić wyłączenie węgla albo zakaz budowy elektrowni jądrowej.

**Opinia publiczna** reaguje na: ceny energii, przerwy w dostawach, zanieczyszczenie powietrza, budowę obiektów w pobliżu miast (efekt NIMBY — linia 400 kV przez teren zamieszkany napotka protesty, wydłużające budowę lub wymuszające droższy wariant kablowy).

---

## 14. Pogoda i zdarzenia losowe

> **Pełny model formalny:** [06-model-astronomiczny-i-pogodowy.md](06-model-astronomiczny-i-pogodowy.md) — wzory na wysokość słońca i długość dnia, model nasłonecznienia, krzywe mocy turbin, reżimy pogodowe, konfiguracja klimatu i szerokości geograficznej. Poniżej pozostaje ujęcie rozgrywkowe.

Pogoda to główny generator napięcia dramaturgicznego, bo działa **jednocześnie na produkcję i na zużycie**:

| Zjawisko | Efekt |
|---|---|
| **Wichura** | wysoka produkcja wiatru → nagłe wyłączenie turbin przy wietrze granicznym; uszkodzenia linii |
| **Bezwietrzna, pochmurna zima (Dunkelflaute)** | OZE ~0 przez wiele dni + maksymalne zapotrzebowanie. Najtrudniejszy test w grze |
| **Fala upałów** | szczyt od klimatyzacji + obniżona obciążalność linii (gorące przewody) + problem z chłodzeniem bloków |
| **Mróz** | rekordowe zapotrzebowanie, ryzyko zamarznięcia instalacji paliwowych |
| **Oblodzenie / szadź** | zerwane przewody, masowe awarie linii |
| **Susza** | brak wody chłodzącej dla bloków cieplnych, niska produkcja wodna |
| **Zaćmienie słońca** | gwałtowny spadek i powrót produkcji PV — rzadkie, spektakularne wyzwanie |
| **Burza** | wyładowania → wyłączenia linii |

**Inne zdarzenia:** awaria bloku, awaria transformatora (długi czas naprawy — transformatory 400 kV produkuje się miesiącami), strajk w kopalni, skok cen gazu, cyberatak na system sterowania, pożar, katastrofa u sąsiada.

**Losowanie zdarzeń przy 36 dobach w roku (patrz §2.1):**
- Zdarzenia **jednodobowe** (awaria bloku, burza, wichura): prawdopodobieństwo na grywalną dobę ≈ 10× rzeczywiste dzienne, żeby zachować realistyczną częstotliwość roczną.
- Zdarzenia **wielodobowe** (Dunkelflaute, fala mrozów, fala upałów, susza): losowane **na poziomie miesiąca**, nie doby — obejmują wtedy wszystkie 3 doby miesiąca. Inaczej straciłyby charakter narastającego kryzysu, w którym magazyny pustoszeją dzień po dniu.
- Zdarzenia **długotrwałe** (awaria transformatora, strajk, kryzys cenowy paliwa): trwają N miesięcy i rzutują na kilkanaście kolejnych dób.

---

## 15. Tryby gry i poziomy trudności

**Tryby:**
- **Kampania** — scenariusze z celami (np. „wyłącz węgiel do 2040 bez blackoutu", „odbuduj system po katastrofie", „zelektryfikuj kraj rozwijający się").
- **Piaskownica** — dowolna mapa, generowana proceduralnie, bez presji.
- **Wyzwania** — pojedyncze doby: „przetrwaj Dunkelflaute", „zbilansuj system po awarii 2 GW". Krótka forma, tabela wyników.
- **Scenariusze historyczne** — odtworzenie prawdziwych blackoutów.

**Poziomy trudności** modyfikują: dokładność prognoz, częstotliwość awarii, surowość regulatora, koszt kapitału, tempo wzrostu zapotrzebowania, poziom szczegółowości modelu elektrycznego.

---

## 16. Kluczowe widoki interfejsu

1. **Mapa — warstwa infrastruktury** — heksy, obiekty, linie z kolorami wg obciążenia (zielony → żółty → czerwony → migający).
2. **Mapa — warstwa napięć** — mapa cieplna napięć węzłowych.
3. **Mapa — warstwa zapotrzebowania** — gdzie jest popyt, gdzie deficyt.
4. **Panel dyspozytorski** — częstotliwość (duży, centralny wskaźnik), bilans mocy, dostępna rezerwa, lista jednostek z suwakami mocy, alarmy.
5. **Wykres doby** — zapotrzebowanie vs produkcja z podziałem na technologie (wykres warstwowy), stan magazynów, saldo wymiany, cena krańcowa.
6. **Panel inwestycyjny** — katalog technologii z porównaniem LCOE, kalkulator opłacalności, harmonogram budów.
7. **Panel finansowy** — rachunek wyników, przepływy, zadłużenie, prognoza.
8. **Panel analityczny** — analiza N-1, prognoza zapotrzebowania, mapa wąskich gardeł, wskaźniki jakościowe.
9. **Schemat jednokreskowy stacji** — widok szczegółowy rozdzielni z polami i wyłącznikami (dla graczy hardcore).

---

## 17. Warunki zwycięstwa i porażki

**Zwycięstwo** (zależnie od scenariusza): dotrwanie do końca horyzontu z systemem spełniającym normy jakościowe · osiągnięcie celów klimatycznych bez utraty niezawodności · osiągnięcie wyznaczonej wartości firmy · maksymalizacja wskaźnika łączonego (niezawodność × przystępność cenowa × czystość).

**Porażka:** bankructwo · blackout krajowy o skali dyskwalifikującej · utrata licencji przez regulatora · dymisja wskutek utrzymującego się braku poparcia społecznego.

**Filozofia:** przegrana powinna być pouczająca, a nie nagła. Gra ma pokazywać nadchodzącą katastrofę z wyprzedzeniem — wskaźnikami, ostrzeżeniami, prognozami — a gracz ma mieć poczucie, że sam ją zawinił, ignorując sygnały.

---

## 18. Świadome uproszczenia

Żeby gra pozostała grą, nie modelujemy: sieci niskiego napięcia (agregacja w mieście) · przebiegów przejściowych i zwarć w skali milisekund · pełnego modelu AC z kątami fazowymi (chyba że tryb Symulacja) · szczegółowej struktury rynku energii (RDN/RB/bilansujący — upraszczone do ceny krańcowej) · ciepłownictwa (poza mechaniką kogeneracji) · rynku paliw poza indeksem ceny.

---

## 19. Pytania otwarte do decyzji

### Rozstrzygnięte

| # | Decyzja | Gdzie |
|---|---|---|
| ✅ | **Skala czasu** — 3 doby reprezentatywne na miesiąc (36 dób/rok) | 2.1 |
| ✅ | **Gra turowa — 24 tury po godzinie na dobę** (zastąpiło czas rzeczywisty) | 2.2–2.3 |
| ✅ | **Prognoza z błędem zamiast stanu bieżącego** — źródło napięcia | 2.4 |
| ✅ | **Przewijanie tur** sterowane przez gracza | 2.5 |
| ✅ | **Model elektryczny — DC power flow** | 4 |
| ✅ | **Start greenfield**, miasta niepodłączone na starcie | 3.4 |
| ✅ | **Skala systemu** — od ~1 GW do 20–30 GW, wynika z przyłączonych miast | 3.4 |
| ✅ | **Waluta — złoty (PLN)**, parametr konfiguracji | 12 |
| ✅ | **Przelicznik 25 km/heks** — heks mieści duże miasto | 3.1 |
| ✅ | **Kapitał startowy 10 mld zł**, konfigurowalny | 3.4 |

### Otwarte

*(pozycje 1–4 — dawne „luki" — rozstrzygnięte i przeniesione wyżej; numeracja pozostałych bez zmian)*

5. **Czy gracz jest jedynym graczem na rynku**, czy istnieją konkurencyjni wytwórcy, z którymi rywalizuje o kontrakty?
6. **Czy modelujemy rozdzielnie na poziomie pól i wyłączników**, czy stacja to jeden obiekt z parametrami? (Propozycja: jeden obiekt z „poziomem układu", widok szczegółowy opcjonalny.)
7. **Czy silnik liczy wewnętrznie gęściej niż tura?** Rozdzielczość *prezentacji* (1 h) nie musi równać się rozdzielczości *obliczeń* — silnik mógłby liczyć w podkrokach 15-minutowych i pokazywać przebieg częstotliwości wewnątrz tury podczas fazy rozstrzygnięcia. Zwiększa wierność i uatrakcyjnia fazę 3, kosztem złożoności.
8. **Czy prosumenci i DSR to mechanika, czy tylko modyfikator profilu?**
9. **Długość kampanii standardowej** (propozycja: 20 lat ≈ 48 h, por. §2.7) i **współczynnik skrócenia czasów budowy K** (przyjęto: 5, por. §2.6).
10. **Platforma i silnik docelowy.** Nie blokuje prototypu — prototyp jest kodem jednorazowym i nie przesądza silnika gry.
11. **Multiplayer?** Naturalny format: każdy gracz to jeden kraj, handel i pomoc awaryjna między nimi. Duży zakres — odłożone.

---

## 20. Proponowane kolejne dokumenty

| # | Dokument | Zakres |
|---|---|---|
| 02 | **Model symulacji elektrycznej** | formalizacja: reprezentacja grafu sieci, algorytm rozpływu DC, model częstotliwości i inercji, obliczanie strat, wykrywanie przeciążeń i kaskad, analiza N-1, krok symulacji — w tym **kolejność faz kroku i model statyzmu** (ustalone na pierwszym prototypie; do sformalizowania od nowa, pliki prototypu usunięto) |
| 03 | **Model ekonomiczny i rynkowy** | merit order, wyznaczanie ceny krańcowej, taryfy, LCOE, model finansowania, sposób strojenia balansu ekonomicznego |
| 04 | **Katalog obiektów** | pełne tabele parametrów wszystkich elektrowni, linii, transformatorów, magazynów — konkretne liczby do implementacji |
| 05 | **Model zapotrzebowania** | profile godzinowe każdego segmentu odbiorców, wpływ temperatury, sezonowość, model wzrostu miast |
| 06 | **[Model astronomiczny i pogodowy](06-model-astronomiczny-i-pogodowy.md)** ✅ | *napisany* — długość dnia, wysokość słońca, nasłonecznienie, wiatr, temperatura, reżimy pogodowe, konfigurowalność klimatu i szerokości geograficznej |
| 06b | **Katalog zdarzeń losowych** | awarie, strajki, kryzysy cenowe, cyberataki — tabela z prawdopodobieństwami i skutkami (część nie-pogodowa) |
| 07 | **Model mapy i generator** | struktura danych heksa, algorytm generowania mapy proceduralnej, rozmieszczanie miast i zasobów, trasowanie linii |
| 08 | **Projekt interfejsu** | makiety kluczowych ekranów, hierarchia informacji, sposób prezentacji danych technicznych bez przytłoczenia gracza |
| 09 | **Progresja i onboarding** | jak wprowadzać mechaniki stopniowo, scenariusze samouczka, krzywa trudności |
| 10 | **Architektura techniczna** | silnik, podział na moduły, wydajność symulacji, format zapisu stanu gry |

### Sugerowana kolejność prac

Rekomenduję zacząć od **dokumentu 02 (model symulacji)** — to on decyduje o wszystkim innym i jest najbardziej ryzykowną częścią projektu. Zanim powstanie reszta, warto zrobić **prototyp techniczny**: 20 węzłów, rozpływ DC, model częstotliwości, kilka elektrowni, jedna doba. Bez grafiki. Cel: sprawdzić, czy bilansowanie jest *frajdą*, czy tylko *pracą*. To pytanie przesądza o kształcie całej gry i lepiej odpowiedzieć na nie w tydzień niż w rok.

> **Status: pierwszy prototyp (dyspozytor.html) powstał i został usunięty.** Zdążył zweryfikować model numerycznie (I prawo Kirchhoffa: błąd 0 MW; astronomia zgodna z tabelą 06 §3.7 co do minuty) — te wyniki pozostają w mocy. Pytanie „frajda czy praca" pozostaje **otwarte** i wymaga rozegrania 5–10 dób na kolejnym prototypie.

Przyjęty model czasu (2.1) podnosi wagę tego prototypu: skoro **każda doba jest grana ręcznie**, a kampania to 720 dób, to doba musi być satysfakcjonująca za 300. razem, nie za pierwszym. Konkretne pytania do zweryfikowania na prototypie:

1. **Ile realnie trwa tura?** Od tego zależy cały budżet kampanii. 10 s → 48 h, 20 s → 96 h.
2. Czy **faza rozstrzygnięcia** wystarczająco niesie dramat, czy gra osuwa się w arkusz kalkulacyjny?
3. Czy **prognoza z pasmem błędu** jest czytelna, i czy gracz faktycznie na niej planuje, zamiast reagować po fakcie?
4. Jak często gracz sięga po **przewijanie** — i czy nie omija nim zbyt wiele?
5. **Ile dób z rzędu da się zagrać, zanim pojawi się znużenie?** Jeśli odpowiedź brzmi „15", to kampania 720-dobowa wymaga przemyślenia — albo skrócenia, albo mocniejszego zróżnicowania dób.

---

*Dokument koncepcyjny — wartości liczbowe są orientacyjne i wymagają strojenia na etapie prototypu.*
