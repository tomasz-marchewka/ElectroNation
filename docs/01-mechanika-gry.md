# ElectroNation — Dokument bazowy mechaniki gry

**Wersja:** 0.25 (dokument koncepcyjny)
**Data:** 2026-08-21
**Status:** obowiązuje **wersja uproszczona** gry; mechaniki odłożone czekają w [90-pomysly-na-przyszlosc.md](90-pomysly-na-przyszlosc.md)

**Zmiany 0.24 → 0.25 (wszystkie ceny inwestycji o połowę niżej):**

1. **Każdy CAPEX w grze spada o połowę** — elektrownie sterowalne, farmy OZE, magazyny,
   linie, stacje rozdzielcze, przyłącza graniczne, akt przyłączenia miasta i systemy
   prognostyczne. Kanoniczne tabele: §4.2 (linie), §5.1 (elektrownie), §5.2 (OZE),
   §5.3 (magazyny), §5.4 (stacja), §5.7 (granica), §2.4 (prognozy).
   **Wszystkie kwoty w starszych wpisach tego dziennika (0.10–0.24) są sprzed cięcia** —
   obowiązują wyłącznie tabele wymienionych paragrafów.
2. **Powód: rabat „CAPEX ~×0,6" z 0.13 (§11) nigdy nie dotarł do technologii
   sterowalnych.** Wiatr i PV stały na ~0,6 ceny realnej, a elektrownie cieplne na cenie
   realnej albo powyżej (CCGT ×1,2), przez co cała flota sterowalna zwracała się o ~2 lata
   wolniej niż dowolna farma. Cięcie objęło najpierw elektrownie, a potem — dla spójności —
   całą resztę katalogu.
3. **Cięcie jest jednolite, więc żadna relacja cenowa się nie zmienia.** Każda technologia
   zwraca się dokładnie **dwa razy szybciej**, w niezmienionej kolejności: wiatr lądowy
   **1,3** · PV **1,5** · wiatr morski **1,8** · węgiel **2,4** · jądrowa **2,7** ·
   CCGT **2,9 roku**; OCGT jak dotąd **nie zwraca się z marży** i pozostaje polisą od kary
   za niedobór (§4.5). Utrzymane są też relacje pochodne: koszt stały linii to nadal
   **1,5% CAPEX-u/rok** (02 §8.3 — obniżony razem z CAPEX-em), a stacja rozdzielcza nadal
   kosztuje mniej więcej **jeden heks linii SN** (§5.4).
4. **Prawdziwą zmianą jest tempo gry, nie równowaga technologii.** Kapitał startowy
   **zostaje 10 mld zł** i kupuje odtąd dwa razy więcej, a każda zainwestowana złotówka
   wraca dwa razy szybciej. Pierwsza fala rozbudowy przestaje być wyborem „albo blok, albo
   korytarz".
5. **Próg wejścia w jądrówkę przestaje być regułą, staje się osądem** (§5.1; osłabia pkt 3
   z 0.24). Najmniejszy blok jądrowy to teraz **8,4 mld zł, czyli mniej niż kapitał
   startowy** — silnik przyjmie takie zamówienie w pierwszej turze. Tym, co nadal stoi na
   drodze, nie jest portfel, lecz **strona popytowa**: 800 MW nie ma czemu sprzedawać przy
   zalążku o szczycie kilkudziesięciu MW, koszt stały biegnie **400 mln zł rocznie** bez
   względu na to, czy blok pracuje (02 §8.3), a wyprowadzenie takiej mocy to osobna
   inwestycja liniowa. Kupienie jądrówki na starcie jest odtąd **błędem gracza, a nie
   odmową silnika**.
6. **Czego cięcie nie dotyczy:** taryfy 650 zł/MWh, kar (4 000 za niedobór, 400 za
   nadwyżkę), cen importu i eksportu, kosztów zmiennych, kosztów stałych liczonych od MW
   (02 §8.3 — elektrownie, farmy, magazyny), czasów budowy, drabiny rozmiarów z 0.24
   i kapitału startowego. Reguła rozbudowy 85% / 70% działa bez zmian — od nowego,
   niższego CAPEX-u.
7. **Otwarte po tej zmianie** (do doc 03, dopisane do §11): czy taryfa i kapitał startowy
   nie są teraz zbyt hojne, skoro cały majątek potaniał dwukrotnie, a zwroty skróciły się
   do 1,3–2,9 roku.

**Zmiany 0.23 → 0.24 (blok elektrowni z czterech rozmiarów):**

1. **Blok elektrowni sterowalnej ma jeden z czterech rozmiarów** (§5.1; uchyla dobieranie
   mocy bloku co do MW). Katalog każdej technologii to **MAŁY / ŚREDNI / DUŻY / WIELKI** —
   cztery szczeble o mocach z tabeli §5.1 i nic pomiędzy. Zamiast pytania „ile dokładnie
   MW" gracz odpowiada na pytanie „który blok"; decyzja zostaje ta sama co była (ile mocy
   dostawić i za ile), ale przestaje być suwakiem o 40 pozycjach.
2. **Rozmiar jest względny wobec technologii.** MAŁY blok jądrowy to 800 MW, WIELKI
   blok CCGT — 500 MW, a WIELKI blok OCGT (150 MW) jest mniejszy od MAŁEGO CCGT. Nazwa
   mówi o miejscu na drabinie **swojej** technologii, nigdy o mocy bezwzględnej, dlatego
   interfejs drukuje MW obok nazwy szczebla (§8 pkt 6).
3. **Próg wejścia w jądrówkę przestaje być fikcją.** Do 0.23 „typowy blok 1000–1600 MW"
   był wyłącznie opisem — silnik przyjmował blok jądrowy dowolnej mocy, więc dało się
   postawić 100 MW jądrówki za 2,1 mld zł. Od 0.24 najmniejszy blok jądrowy to 800 MW.
   *(Kwota tego progu — wtedy 16,8 mld wobec 10 mld kapitału — spadła w 0.25 do 8,4 mld
   razem z CAPEX-em; sama reguła „nie ma bloków jądrowych o mocy turbiny szczytowej"
   obowiązuje bez zmian.)* Analogicznie znika „blok" węglowy o mocy turbiny szczytowej.
   **Drugi koniec drabiny idzie w górę:** blok jądrowy WIELKI to **2 400 MW** (bliźniacza
   lokalizacja dwóch reaktorów klasy 1 200 MW), a więc moc, której **nie wyprowadzi jedna
   linia WN** (1 500 MW — §4.2). Największa jednostka w grze wymusza drugi tor albo
   rozdział mocy na dwa kierunki; to ta sama zasada co przy morskiej farmie 600 MW
   w linii SN (02 §8.4).
4. **Rozbudowa idzie z tego samego katalogu** (§7): dostawiany blok też jest jednym
   z czterech rozmiarów i **nie musi** być równy blokom już stojącym na heksie. Panel
   podpowiada szczebel najbliższy temu, co na heksie stoi, bo obiekt ze stanu startowego
   albo starego zapisu może mieć moc spoza drabiny.
5. **Czego zmiana nie dotyczy.** Farmy OZE i magazyny dobiera się jak dotąd: farma
   dowolną mocą do limitu heksa (§5.2), bateria osobnymi modułami mocy i pojemności
   (§5.3) — tam blok nie istnieje, a za drabinę robi limit lokalizacji. Bez zmian
   zostają też ceny (CAPEX w zł/MW), czasy budowy, koszty stałe i limit **6 bloków**
   na heksie (§7).
6. **Stan startowy zostaje bez zmian** (§3.4): CCGT 400 MW to dokładnie szczebel DUŻY,
   więc zalążek gracza daje się od 0.24 opisać katalogiem.

**Zmiany 0.22 → 0.23 (nadwyżka karana bez względu na źródło; linia do budowy):**

1. **Kara bilansowa obejmuje całą nadwyżkę, także OZE** (§4.1, §6; uchyla „zrzut OZE
   pozostaje bez kary" z 0.16). Stawka bez zmian — **400 zł/MWh** — ale podstawą jest
   suma nadwyżki wszystkich źródeł, a nie sama produkcja sterowalna. Zasada tury brzmi
   teraz symetrycznie: **pokryj zapotrzebowanie i nie produkuj ponad nie**, a czym
   nadprodukowałeś, nie ma znaczenia.
2. **Kiedy to w ogóle uderza.** Rozpływ bierze OZE pierwsze (koszt zmienny 0), więc OZE
   jest przycinane **ostatnie** — kara sięga po nie dopiero, gdy sama pogoda przerasta
   wszystko, co sieć może wchłonąć (miasta + ładowanie magazynów + eksport), albo gdy
   wąskie gardło odcina farmę od odbioru. To nie jest podatek od posiadania OZE, tylko
   cena za moc, której nie ma czym wyprowadzić ani gdzie odłożyć.
3. **Czym gracz się broni.** Ładowanie magazynu i eksport liczą się jako odbiór i karę
   znoszą (02 §5.2 — eksport daje efektywnie ~550 zł/MWh). Ostatnią deską ratunku jest
   **wyłączenie całej farmy** (§5.2): farma wyłączona nie produkuje, więc nic nie jest
   winna. Częściowego zadawania mocy OZE nadal nie ma — to świadomie zostawia narzędzie
   tępe, bo decyzję trzeba podjąć **przed** ujawnieniem pogody.
4. **Konsekwencja, którą trzeba przyjąć.** Farma bez wyprowadzenia mocy — postawiona,
   zanim linia się dobuduje, albo odcięta przez zbyt cienki tor — **kosztuje co turę**,
   dokładnie tak, jak od 0.16 kosztuje nastawiony blok, którego nie ma czym odebrać.
   Symetria jest zamierzona: silnik nie zna „nastawy" OZE, ale zna włącznik.
5. **Kalibracja 92. percentyla stoi** (02 §5.2). Dotyczyła nastawy sterowalnych wobec
   `popyt − OZE` i nadal jej dotyczy: krańcową nadwyżką prawie zawsze jest blok
   sterowalny, bo to on jest w merit order ostatni. Kara OZE dokłada osobną presję —
   na **rozmiar floty OZE względem sieci i magazynów**, nie na nastawę tury.
6. **Linię wolno poprowadzić do obiektu, który dopiero się buduje** (§3.3, §7). Cel
   trasy nie musi już stać — wystarczy, że jego budowa jest zlecona i heks zajęty.
   Przyłącza budowanego obiektu są rezerwowane od razu, więc plac budowy nie zbierze
   więcej końców linii, niż gotowy obiekt będzie miał gniazd (§5.4). Bez tej zmiany
   każdy nowy obiekt musiał czekać na wyprowadzenie mocy **po** ukończeniu, a od
   pkt. 1 taki przestój kosztuje.
7. **Obiekt, przy którego heksie w chwili ukończenia nie ma gotowej linii, wchodzi do
   gry WYŁĄCZONY** (§5.2, §7). Dotyczy to w praktyce wyłącznie farmy OZE: elektrownia,
   magazyn i przyłącze graniczne i tak startują z nastawą zero, a farma startowała
   produkująca — czyli od pkt. 1 od razu zadłużona. Linia ukończona **tego samego dnia**
   co obiekt liczy się jako połączenie. Farmę włącza się jednym kliknięciem, gdy
   wyprowadzenie stanie; jest to świadomie decyzja gracza, a nie automat.

**Zmiany 0.21 → 0.22 (wiatr morski wchodzi do gry):**

1. **Farmy wiatrowe wolno stawiać na morzu** (§3.2, §5.2; uchyla „obiektów na wodzie
   budować nie można" w części dotyczącej wiatru). To **te same turbiny co na lądzie** —
   jedna technologia, jedna krzywa mocy §5.2, to samo sterowanie włącz/wyłącz. Różni je
   wyłącznie lokalizacja: heks morski ma klasę wiatrową **morską** (06 §6.1: λ = 10,2,
   CF ~47%), czyli **1,8× produkcji terenu otwartego**. Wszystko inne — elektrownie, PV,
   magazyny, stacje rozdzielcze, przyłącza graniczne — na wodzie nadal **nie stoi**
   (02 §8.1: „bez stacji pośrednich na wodzie").
2. **Mnożnik kosztu obiektu na morzu = ×2,5** (02 §8.1, nowa kolumna tabeli terenu).
   Świadomie **nie** ×3,5 od kabla podwodnego: tamten mnożnik strojono dla linii, a nie
   dla fundamentu. Przy ×3,5 morze kosztuje 93% więcej za roczną MWh niż ląd i — skoro
   miejsca na lądzie nie brakuje (332 heksy zabudowywalne wobec 47 morskich) — nikt by
   go nie kupił. ×2,5 daje +38%: morze jest **premią za jakość zasobu**, nie tanią
   energią. Zwrot ~3,5 roku, między wiatrem lądowym (~2,7) a flotą cieplną (4,1–5,1).
   *(Kwoty sprzed cięcia z 0.25; po nim wszystkie trzy skróciły się o połowę — morze 1,8
   wobec 1,3 na lądzie i 2,4–2,9 dla floty cieplnej. Sama pozycja morza między lądem
   a flotą cieplną obowiązuje bez zmian, bo cięcie było jednolite.)*
3. **Heks morski mieści 600 MW, lądowy nadal 300** (§7, 02 §8.4) i **budowa trwa 2 doby
   zamiast 1**. Limit lokalizacji i czas budowy przestają być stałą technologii, a stają
   się funkcją terenu. Pełny heks morski to **5,4 mld zł** — ponad połowa kapitału
   startowego — i **nie mieści się w linii SN** (500 MW), więc wymusza WN albo drugi tor:
   wyprowadzenie mocy na ląd jest osobną decyzją inwestycyjną, nie dodatkiem.
4. **Czego morze NIE zmienia — i to jest powód, dla którego wchodzi.** Zmierzone na 60
   symulowanych latach: w **Dunkelflaute** klasa morska daje CF **0,001** (ląd 0,000) —
   reżimowy mnożnik wiatru (0,25 / 0,20) ścina λ = 10,2 poniżej prędkości startowej
   turbiny tak samo jak λ = 7,3. W **sztormie** morze wypada **gorzej** od lądu (0,78 vs
   0,87), bo szybciej przebija wyłączenie przy 25 m/s. Cała przewaga siedzi w reżimach
   zwyczajnych. Morze dokłada więc **taniej energii bazowej, a nie mocy w kryzysie** —
   gaz, magazyn i import zostają dokładnie tak samo potrzebne, a najtrudniejszy test gry
   pozostaje nietknięty. Zysk rozgrywkowy: **znika letnia zapaść wiatru** (CF VI–VIII
   0,29–0,34 wobec 0,10–0,13 na lądzie).

**Zmiany 0.20 → 0.21 (stacja rozdzielcza bez własnej przepustowości):**

1. **Stacja rozdzielcza nie ma własnej przepustowości** (§4.3, §5.4; uchyla „250 MW
   +250 za moduł" z 0.12). Przepuszcza wszystko, co przyniosą linie — wąskim gardłem
   korytarza jest odtąd wyłącznie linia. Powód: limit węzła dublował limit linii i to
   poniżej jego wartości (stacja 250 MW przy linii SN 500 MW), więc **każda** świeżo
   postawiona stacja zwężała korytarz SN i WN — narzędzie do łączenia korytarzy
   psuło korytarz. Lekcja „można mieć dość mocy i nie dostarczyć jej tam, gdzie
   trzeba" (§4.4) zostaje w całości przy linii: typ, liczba torów i straty.
   Odpowiednik szyny zbiorczej wymiarowanej pod linie, nie niezależnie od nich.
2. **Cena stacji 150 → 60 mln zł** (§5.4), czyli mniej więcej **jeden heks linii SN**.
   Reguła kciuka: stacja zwraca się w chwili, gdy oszczędza jeden heks zdublowanego
   korytarza SN. Koszt stały spada do 1,2 mln zł/rok (2% CAPEX-u, 02 §8.3).
3. **Moduł rozbudowy stacji znika; przyłączy jest na sztywno 12** (§5.4; uchyla
   „6 +2 za moduł, do 18" z 0.12). Bez przepustowości modułowi zostawałyby same
   przyłącza — po nowej cenie stacji drożej niż postawienie drugiej stacji obok.
   Stacja ma odtąd jeden parametr: dwa razy tyle przyłączy co zwykły obiekt.

**Zmiany 0.19 → 0.20 (wstęga: plan przed nami zamiast pasma sprzed tury):**

1. **Pasmo prognozy popytu znika z historycznej części wstęgi** (§8 pkt 2; uchyla pasmo
   „sprzed rozstrzygnięcia" z 0.18). Rozstrzygnięta tura pokazuje na wykresie to, co się
   stało — prawdę i pokrycie warstwami. Porównanie zakładu z wynikiem zostaje przy
   liczbach paska raportu, gdzie czyta się je co do MW; na siedmiowarstwowym stosie
   drugie pasmo dokładało kreski, a nie wiedzy.
2. **Przed nami wstęga rysuje plan przy obecnych nastawach** (§8 pkt 2): te same warstwy
   co za nami — nastawy elektrowni, importu i magazynów (moc magazynu ograniczona
   bieżącym SOC), a wiatr i PV z prognozy produkcji. Wstęga staje się przez to
   symetryczna także na wykresie: wstecz wynik, w przód zakład.
3. **Plan rysuje się szrafurą i o krok wyszarzony** (§8 pkt 2): ta sama geometria
   i te same kolory technologii co za nami, ale tekstura zamiast pełnego wypełnienia,
   niższa saturacja i słabsze wypełnienie. Kolor mówi, z czego plan jest złożony;
   szrafura i wyszarzenie — że to zakład, nie pomiar. Wyszarzenie jest **jednym krokiem,
   nie praniem**: w pełni szary stos przestaje odpowiadać na pytanie „z czego".
4. **Plan nie jest przycinany do popytu** (§8 pkt 2, §4.1): stos ponad prognozą popytu to
   zrzut, który tura ukarze, a luka pod nią to niedobór do domknięcia. Skala pionowa
   obejmuje plan, więc nastawa wzięta z sufitu widać na wykresie od razu. Plan jest
   **ślepy na sieć** — jak kolumna „bilans przy obecnych nastawach" (§8 pkt 3): bez
   limitów linii i bez strat, to plan produkcji, a nie zapowiedź rozpływu.

**Zmiany 0.18 → 0.19 (linia przerywana na mijanym obiekcie):**

1. **Gotowa linia nigdy nie mija obiektu — przecina się na nim** (§3.3): trasa przez heks
   z obiektem to w stanie gry **dwie osobne linie**, obie kończące się w tym obiekcie.
   Odczep „w przelocie" z 0.13 przestaje być tylko własnością grafu rozpływu (02 §2)
   i staje się własnością stanu: każdy odcinek ma własne id, własną rozbudowę i własne
   anulowanie. Suma długości, kosztu i przepustowości bez zmian.
2. **Przelot kosztuje dwa przyłącza, nie jedno** (§3.3; uchyla „zajmuje to jedno jego
   przyłącze liniowe" z 0.13). Odpowiada to definicji przyłącza z 0.12 — po jednym
   z każdego sąsiedniego heksa: linia w przelocie wchodzi z jednej strony i wychodzi
   drugą. Przy 6 przyłączach obiekt przepuszcza więc najwyżej 3 trasy w przelocie.
3. **Symetryczna blokada budowy** (§3.3): heks, przez który biegnie tyle linii, że po
   przecięciu przekroczyłyby przyłącza obiektu, nie jest placem budowy. Wcześniej reguła
   działała tylko przy prowadzeniu linii przez stojący obiekt.
4. **Linia w budowie zostaje jednym zleceniem** (§2.6, §3.3) — przecina się dopiero
   w chwili uruchomienia, więc czas budowy trasy się nie zmienia.

**Zmiany 0.17 → 0.18 (wstęga czasu: przegląd tur wstecz i horyzont kroczący):**

1. **Oś tur i wykres doby zlewają się we wstęgę czasu** (§8 pkt 2): jedna wstęga przewijana
   lewo-prawo, o wspólnej osi X, sięgająca wstecz do pierwszej rozegranej tury i w przód do
   granicy horyzontu prognozy. Doba to nadal 8 tur po 3 h (§2.2) — wstęga pokazuje ich
   więcej niż osiem naraz, ale nigdy nie zmienia jednostki.
2. **Klik w turę = podgląd, nigdy ruch czasu** (§2.5). Przewijanie zostaje przy swoim
   przycisku obok „następnej tury", a wybór tury na wstędze tylko nadaje mu cel. Wcześniej
   klik w komórkę przyszłej tury nieodwracalnie rozstrzygał tury — jedno mylne kliknięcie
   zjadało pół doby.
3. **Raport na dole opisuje turę wybraną, nie zawsze ostatnią** (§2.3, §8 pkt 5). Domyślnie
   wybrana jest tura ostatnio rozstrzygnięta, czyli stan sprzed 0.18. Dla tury przyszłej
   pasek pokazuje **kartę prognozy** tej tury (pasma, nie wynik) — wstęga jest przez to
   symetryczna: wstecz zakład rozstrzygnięty, w przód zakład do postawienia.
4. **Horyzont prognozy jest kroczący** (§2.4; 06 §8.6.3): 24 h / 3 doby / 7 dób liczone
   **od tury bieżącej**, a nie do końca bieżącej doby. Poziom podstawowy widzi więc zawsze
   pełną dobę do przodu, także przez granicę doby. Uchyla „prognoza na bieżącą dobę" z 0.13.
   Lekki buff poziomu podstawowego — pozycja do weryfikacji przy dokumencie 03.
5. **Archiwum tur należy do stanu gry** (§8 pkt 2; 02 §4): każda rozstrzygnięta tura zostawia
   **skrót** (wynik, pokrycie warstwami, zakład z prognozą, miasta w niedoborze), trwały
   i zapisywany razem ze stanem. Pełny raport tury żyje dalej tylko dla tury ostatniej —
   mapa nie cofa się razem ze wstęgą i pokazuje zawsze stan bieżący (§8 pkt 1).

**Zmiany 0.16 → 0.17 (rozbudowa linii przesyłowych):**

1. **Gotową linię można rozbudować do wyższego typu** (§4.2, §7): NN→SN, NN→WN, SN→WN —
   nigdy w dół, nigdy dla linii w budowie, jedna rozbudowa na linię naraz. Cena i czas wg
   ogólnej reguły rozbudowy: **85% CAPEX-u i 70% czasu** nowej linii docelowego typu na tej
   samej trasie (z mnożnikami terenu). Płatność z góry, anulowanie = utrata nakładów (§2.6).
2. **Linia pracuje przez całe roboty na starym typie** — stara przepustowość, stare straty
   i stary koszt stały obowiązują do chwili ukończenia, wtedy linia przeskakuje na nowy typ.
   Rozbudowa nie wyłącza korytarza, tak jak rozbudowa elektrowni nie zatrzymuje stojących
   bloków (§7).
3. **Limit korytarza ⩽9 linii jednego typu na heks zostaje bez zmian** (§3.3), ale linia
   w trakcie rozbudowy liczy się do **obu** liczników — starego i docelowego typu. Bez tego
   dziewięć równoległych rozbudów NN→SN na heksie z dziewięcioma liniami SN dałoby po
   ukończeniu 18 linii SN. Liczba przyłączy obiektu się nie zmienia: rozbudowa podmienia typ
   linii, nie dokłada nowej.

**Zmiany 0.15 → 0.16 (zatwierdzenie dokumentu 02 — model symulacji):**

1. **Dokument 02 napisany i obowiązuje** ([02-model-symulacji.md](02-model-symulacji.md)):
   graf sieci (linia w przelocie = segmentacja na węzłach), rozpływ = **kolejne najtańsze
   ścieżki** (koszt dostarczenia = koszt zmienny źródła / sprawność trasy, deterministyczne
   tie-breaki), krok rozstrzygnięcia w trzech przebiegach (**miasta → ładowanie magazynów →
   eksport**), **niedobór emergentnie w miastach najdalszych** i za wąskimi gardłami (§4.5).
2. **Nadwyżka sterowalna przestaje być darmowa** (§4.1): **kara bilansowa 400 zł/MWh
   zrzutu** (kalibracja: optymalne pokrycie ~92. percentyl pasma prognozy — 02 §5.2);
   paliwo płatne tylko od energii wykorzystanej; import take-or-pay (od nastawy).
   Zrzut OZE pozostaje bez kary.
3. **Uzupełnione parametry** (02 §8): mnożniki terenu (linie mogą biec przez jezioro ×2,5
   i morze ×3,5), CAPEX magazynów, koszty stałe wszystkich obiektów, rozbudowa **70% czasu /
   85% CAPEX-u / limit 6 bloków**, limity OZE **wiatr 300 / PV 200 MW na heks**;
   **mapa v1 = jedna ręczna 24×16 z 8–12 miastami** (generator — dokument 07).

**Zmiany 0.14 → 0.15 (doprecyzowanie struktury tury):**

1. **Tura nie jest sekwencją faz** (§2.3; uchyla ekranową sekwencję FAZA 1–4 z 0.4):
   prognoza, raport **ostatniej** tury i nastawy współistnieją w jednym stałym widoku,
   nastawy są edytowalne cały czas, a jedyną akcją przechodzącą czas jest klik
   **„następna tura"**, który uruchamia rozstrzygnięcie (krok silnika — doc 02 §4).
   Pojęcia prognoza/decyzja/rozstrzygnięcie/raport zostają jako elementy widoku
   i kontraktu silnika, nie jako kolejne ekrany.

**Zmiany 0.13 → 0.14 (zatwierdzenie dokumentu 05 — model zapotrzebowania):**

1. **Dokument 05 napisany i obowiązuje** ([05-model-zapotrzebowania.md](05-model-zapotrzebowania.md)):
   miasto opisują **dwie liczby stanu — gospodarstwa domowe i firmy**, każdy segment
   z własnym profilem godzinowym i zużyciem jednostkowym (10 / 50 kWh na dobę roboczą;
   w dobę wolną firmy ~30% poboru). Sezonowość i czynnik pogodowy sformalizowane (05 §4).
2. **Docelowy mechanizm wzrostu miast** (05 §6; **uchyla tymczasową formułę logistyczną
   z 0.13**): miesięczna ocena dostarczenia `U` — przy `U > 99%` wzrost losowy 0–4%/mies.
   osobno dla gospodarstw i firm, tłumiony logistycznie pojemnością (16× stan startowy);
   90–99% stagnacja; poniżej 90% kurczenie o połowę niedostarczonego udziału; podłoga
   100 gospodarstw / 10 firm; **miasta niepodłączone zamrożone**. Młode miasta rosną
   ~25%/rok — ostrzejszy zakład „budowa vs popyt" (§2.6); walidacja w dokumencie 03.
3. **§5.6 odsyła do dokumentu 05**; klasy wielkości miast zostają jako etykiety pochodne
   od szczytu; profil miasta jest emergentny z segmentów (dolina nocna ~48% szczytu,
   szczyt doby wolnej ~90% roboczego — 05 §3.3).

**Zmiany 0.12 → 0.13 (przegląd i zatwierdzenie założeń przez projektanta):**

1. **Trzy typy linii przesyłowych** (§4.2; uchyla „jeden typ linii" z 0.11): niskie
   napięcie (150 MW — najtańsze, najszybsze w budowie, największe straty), średnie
   (500 MW) i wysokie (1500 MW — najdroższe, najniższe straty). Czasy budowy **3/6/12 h
   na heks trasy** wg typu. Przez jeden heks może biec **najwyżej 9 linii jednego typu**.
2. **Linia przechodząca przez heks z obiektem automatycznie go przyłącza** (§3.3) —
   obiekt staje się węzłem na trasie; odgałęzienie zajmuje jedno jego przyłącze liniowe.
3. **OZE: jedyne ręczne sterowanie to wyłączenie/włączenie całej farmy** (§4.1);
   przycinanie nadwyżek pozostaje automatyczne.
4. **Prognoza: bazowy horyzont 24 h (bieżąca doba); poziomy systemów prognoz zwężają
   pasmo i wydłużają horyzont** — do 3 dób (zaawansowany) i 7 dób (ansamblowy, maksimum);
   każda kolejna doba prognozy ma większy błąd (§2.4, 06 §8.6.3).
5. **Ekonomia: kanonem zostają wartości wystrojone graniem w prototyp** — taryfa
   650 zł/MWh, kara 4 000 zł/MWh, CAPEX-y ~×0,6 względem 0.11, przyłącze graniczne
   1,0 mld (+0,7 mld/moduł), akt przyłączenia miasta 30 mln zł (§4.5, §5, §6);
   formalizacja i test spójności — dokument 03.
6. **Rozbudowa nie wykracza poza heks** (doprecyzowanie §7): obiekt zawsze zajmuje
   dokładnie 1 heks; rozbudowa dodaje bloki/moduły w jego obrębie („ulepszenie").
7. **Wysycanie wzrostu popytu — tymczasowa formuła logistyczna** (§2.7, §5.6): wzrost
   roczny miasta = 10% × (1 − szczyt/pojemność), pojemność miasta ≈ 16× szczyt startowy.
   **Mechanizm wzrostu miast jest świadomie prowizoryczny — do przerobienia w dokumencie 05.**

**Zmiany 0.11 → 0.12 (wnioski z grania w prototyp):**

1. **Doba = 8 tur po 3 godziny** zamiast 24 tur godzinowych (§2.2): tury noszą nazwy pór
   doby (NOC, RANO, POŁUDNIE, SZCZYT WIECZORNY…). Prawda pogodowa i profil popytu pozostają
   **godzinowe** (dokument 06 bez zmian) — tura widzi średnie swojego bloku, a energia,
   pieniądze i postęp budowy linii liczą się jak moc × 3 h. Wniosek z prototypu: 24
   zatwierdzenia na dobę to za dużo — większość tur nie zawierała decyzji. (Rozważany
   wariant bloków o nierównej długości 2–5 h odrzucony na rzecz prostoty rachunku.)
2. **Czasy budowy skrócone ponownie ×2 (K ≈ 40, §2.6)**; linie: **3 h gry na heks trasy**
   = dokładnie 1 heks na turę.
3. **Panel heksa zamiast okienka obiektu i zakładki budowy** (§8): klik na dowolny heks
   (także pusty) otwiera panel dokowany przy prawej krawędzi mapy — informacje o heksie,
   katalog budowy dostępny w tym miejscu (**jedyna droga budowania**), szczegóły i akcje
   obiektu; linię prowadzi się z panelu obiektu. Panel dyspozytora jest **stale widoczny**.
4. **Limit przyłączy liniowych: 6 na obiekt** — po jednym z każdego sąsiedniego heksa
   (§3.3; wcześniej 2 — wniosek z grania: za mało). Każdy obiekt może rozgałęziać; stacja
   rozdzielcza przestaje być jedynym węzłem zbiorczo-rozdzielczym, pozostaje dedykowanym
   węzłem z rozbudową przyłączy (6 +2/moduł, do 18) i własną przepustowością.

**Zmiany 0.10 → 0.11 (wnioski z prototypu):**

1. **Topologia bezpośrednia** zastępuje topologię stacyjną (§3.3): linie przesyłowe łączą
   obiekty wprost (elektrownia—miasto, magazyn—stacja…), każdy obiekt jest węzłem sieci
   z ograniczoną liczbą przyłączy liniowych. Stacja elektroenergetyczna zostaje zastąpiona
   **stacją rozdzielczą** — jedynym obiektem, w którym kilka linii zbiera się w jeden węzeł
   albo rozdziela na kilka kierunków (§4.3, §5.4). Uchylona decyzja 0.9 „promień obsługi
   stacji = 1 heks"; dawna topologia stacyjna czeka w 90 §4.
2. **Jeden typ linii przesyłowej** (§4.2) — typy 110/220/400 kV odłożone do 90 §4.
3. **Czasy budowy skrócone ×4** względem 0.10 (K ≈ 20, §2.6); linie budują się w godzinach
   gry: **6 h na heks trasy**.
4. **Okienko informacyjne obiektu** w UI (§8): klik na miasto, elektrownię, stację
   rozdzielczą lub linię otwiera okienko ze szczegółami i akcjami.

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
**w każdej turze doby** zapotrzebowanie na moc było pokryte. Zarabia na sprzedanej energii,
płaci za paliwo, infrastrukturę i każdą niedostarczoną megawatogodzinę.

Sednem gry są trzy proste, fizycznie umocowane ograniczenia:

1. **Bilans musi się domykać w każdej turze** — energię trzeba wyprodukować (albo wyjąć
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

### 2.2 Rozgrywka turowa — doba to 8 tur po 3 godziny

**DECYZJA (0.12): gra jest turowa, doba składa się z 8 tur po 3 godziny.** (24 tury po
godzinie z wersji 0.4–0.11 nie przetrwały prototypu: za dużo zatwierdzeń, w większości bez
żadnej decyzji. Rozważany wariant bloków o nierównej długości 2–5 h odrzucony — równe bloki
upraszczają rachunek i rytm gry.) Tury noszą nazwy pór doby:

| # | Blok | Tura | Co się dzieje |
|---|---|---|---|
| 1 | 00–03 | **NOC** | dno doliny nocnej; często silny wiatr |
| 2 | 03–06 | **PRZEDŚWIT** | najniższy popyt; latem wschód słońca |
| 3 | 06–09 | **RANO** | rampa poranna; zimą wschód słońca |
| 4 | 09–12 | **PRZEDPOŁUDNIE** | garb poranny dnia roboczego, PV rośnie |
| 5 | 12–15 | **POŁUDNIE** | maksimum produkcji PV |
| 6 | 15–18 | **POPOŁUDNIE** | PV opada, popyt wspina się ku szczytowi |
| 7 | 18–21 | **SZCZYT WIECZORNY** | szczyt dobowy; zimą już po zachodzie (PV = 0) |
| 8 | 21–24 | **PÓŹNY WIECZÓR** | opadanie do doliny nocnej |

Każda tura wymaga zatwierdzenia — nie ma czasu rzeczywistego ani pauzy. Turowość pozostaje
uczciwa wobec danych: **prawda pogodowa i profil zapotrzebowania są nadal godzinowe**
(dokument 06 obowiązuje bez zmian) — tura widzi **średnie swojego bloku**, a energia,
koszty i postęp budów liniowych liczą się jak moc × 3 h. Nastawa obowiązuje przez cały
blok — to na nazwanych porach doby (SZCZYT WIECZORNY vs NOC) gracz uczy się rytmu
zakładów z prognozą.

### 2.3 Struktura tury — jeden ciągły widok, jedno kliknięcie

**DECYZJA (0.15, doprecyzowuje 0.4): tura nie jest sekwencją faz.** Prognoza, raport
i decyzje nie następują po sobie jako osobne ekrany — współistnieją w jednym stałym
widoku, a czas przesuwa wyłącznie klik **„następna tura"**:

```
┌──────────────────────────────────────────────────────────────┐
│  WIDOK CIĄGŁY (między kliknięciami)                          │
│                                                              │
│  PROGNOZA  panel prognozy: popyt i OZE na kolejne godziny,   │
│            Z BŁĘDEM — pasmo rozszerza się z horyzontem       │
│  RAPORT    panel raportu WYBRANEJ tury (domyślnie ostatniej  │
│            rozstrzygniętej): wynik finansowy, energia        │
│            niedostarczona, koszt pomyłki prognozy — §2.5     │
│  DECYZJA   nastawy edytowalne CAŁY CZAS: elektrownie,        │
│            magazyny (ładuj/oddawaj), import/eksport,         │
│            wyłączenia farm OZE                               │
│                                                              │
│                     [ NASTĘPNA TURA ]                        │
│                            │                                 │
│  ROZSTRZYGNIĘCIE (silnik, animowane): ujawnia się prawdziwa  │
│  pogoda i popyt; rozpływ wyznacza, co dopłynęło do miast,    │
│  ile zjadły straty, gdzie zabrakło mocy lub przepustowości   │
│  (krok silnika — dokument 02 §4). Widok wraca do stanu       │
│  ciągłego z odświeżoną prognozą i raportem.                  │
└──────────────────────────────────────────────────────────────┘
```

Rozstrzygnięcie ma być **pokazane, nie tylko podliczone**: przepływy na mapie, linie
zmieniające kolor z obciążeniem, miasto w niedoborze gasnące na oczach gracza. Dramat polega
na tym, że gracz **patrzy, jak rozstrzyga się jego zakład z prognozą**. Jeśli ten moment
będzie tylko odświeżeniem liczb, mechanika umrze.

**Uzupełnienie 0.18: raport nie znika wraz z następną turą.** Pasek raportu opisuje turę
**wybraną na wstędze czasu** (§8 pkt 2), a domyślnie — turę ostatnio rozstrzygniętą, więc
widok domyślny jest dokładnie taki jak przed 0.18. Wybór tury innej niż bieżąca jest
wyłącznie odczytem: **nie rusza czasu, nie zmienia nastaw i nie cofa mapy** (§2.5).
Każde przesunięcie czasu — zatwierdzenie tury, przewinięcie, wczytanie zapisu — sprowadza
wybór z powrotem na turę ostatnio rozstrzygniętą; gracz nigdy nie planuje, patrząc
niechcący na dane sprzed tygodnia.

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
2. **Prognoza na najbliższą turę jest dokładna — trudne są decyzje na kilka tur naprzód.**
   W wersji uproszczonej (bez czasów rozruchu) dotyczy to głównie **gospodarki magazynem**
   („ile zostawić na wieczorny szczyt, skoro prognoza wiatru na blok 18–21 ma pasmo
   ±120 MW?") i utrzymywania zapasu mocy sterowalnej. Pełna głębia (rozruchy bloków = unit
   commitment) wraca później — 90 §3.
3. **Trudność bierze się z wariancji, nie z poziomu.** Przewidywalny niedobór jest łatwiejszy
   od nieprzewidywalnej obfitości (obserwacja z pierwszego prototypu — 90 §1.8).
4. **Prawda jest generowana w całości przy inicjalizacji doby**, prognoza jest jej zaszumionym
   widokiem (06 §8.6.1). Doba jest przez to **odtwarzalna z ziarna losowego** — wymóg
   architektoniczny silnika.

**Dokładność i zasięg prognozy są kupowalne** (0.13; inwestycje w systemy prognostyczne —
06 §8.6.3). Poziomy **zwężają pasmo** (mnożniki σ ×1,0 / ×0,7 / ×0,5) **i wydłużają
horyzont**: podstawowy **24 h**, zaawansowany **3 doby**, ansamblowy **7 dób** (maksimum).
Każda kolejna doba prognozy niesie większy błąd — σ rośnie dalej z horyzontem. Ceny poziomów
(parametr, doc 03): ~300 mln / ~600 mln zł. Rzadki przypadek inwestycji, która nie dodaje ani
megawata, a obniża koszty. Prognoza jest prezentowana jako **pasmo, nie liczba** (06 §8.6.4).

**DECYZJA (0.18): horyzont jest kroczący — liczy się od tury bieżącej, nie do końca doby.**
Uchyla „prognoza na bieżącą dobę" z 0.13. W jednostce gry brzmi to prościej niż w godzinach:
**prognoza obejmuje zawsze tyle samo tur** — poziom podstawowy 8 (tura bieżąca i 7 kolejnych),
zaawansowany 24, ansamblowy 56 — niezależnie od tego, która to pora doby. Powody:

- **Horyzont, który topnieje w ciągu doby, nie jest horyzontem.** Wersja poprzednia dawała
  o PÓŹNYM WIECZORZE 3 h prognozy i nazywała to systemem 24-godzinnym; decyzje magazynowe
  na noc i poranek doby następnej — czyli najtrudniejsze, jakie ta gra ma — nie miały żadnej
  podstawy.
- **Interfejs od początku obiecywał wersję kroczącą**: pasek górny pisze `PODSTAWOWY · 24 H`
  niezależnie od pory doby.
- Wielkość, którą horyzont ogranicza, jest jedna: **jak daleko w przód wolno przewinąć
  wstęgę czasu** (§8 pkt 2). Za granicą horyzontu wstęga po prostu się kończy — nie ma
  „prognozy szarej" ani wartości bez pasma.

Skutkiem jest lekkie wzmocnienie poziomu podstawowego (zyskuje do 21 h widoku doby
następnej) i osłabienie różnicy wobec zaawansowanego. Przyjęte świadomie: dokument 03
(ekonomia) przy strojeniu cen poziomów bierze to jako pozycję do weryfikacji — narzędziem
korekty jest cena i mnożnik σ, nie powrót do horyzontu topniejącego.

### 2.5 Przewijanie tur i podgląd wstecz

**DECYZJA (0.18): to są dwie różne rzeczy i mają dwie różne kontrolki.** Podgląd jest
odczytem i jest darmowy; przewijanie rozstrzyga tury i jest nieodwracalne. Do 0.17 obie
mieszkały pod tym samym kliknięciem w oś tur, więc pomyłka o jedną komórkę kosztowała
pół doby.

**Podgląd (klik w dowolną turę wstęgi czasu — §8 pkt 2).** Nigdy nie rusza czasu, nie
zmienia nastaw i nie cofa mapy. Zmienia wyłącznie to, co opisuje pasek na dole:

- **tura wstecz** — jej raport: wynik, pokrycie, niedobór, rozstrzygnięty zakład
  z prognozą (dokładnie ten sam, który gracz widział na żywo);
- **tura w przód**, w granicach horyzontu (§2.4) — **karta prognozy** tej tury: popyt,
  wiatr i PV jako pasma, wyraźnie oznaczone jako prognoza, nie wynik.

Zasięg wstecz jest nieograniczony: każda rozstrzygnięta tura zostawia trwały skrót
w stanie gry (§8 pkt 2). Zasięg w przód to horyzont kupionego systemu prognostycznego —
8 tur, 24 albo 56 (§2.4). Przewijanie wstęgi jest przez to najbardziej dosłownym efektem
tej inwestycji, jaki gra ma.

**Przewijanie (jawna akcja, nigdy zwykły klik).** Obie jego postacie dzielą **jeden
przycisk**, stojący przy „następnej turze" (§8 pkt 5) — wstęga tylko go celuje:

- **bez wybranej tury w przód** — „przewiń, aż coś się stanie": zatrzymanie przy niedoborze,
  przeciążeniu linii powyżej progu, odchyleniu od prognozy albo zmianie bilansu
  przekraczającej zadany próg;
- **z turą przyszłą wybraną na wstędze** — „przewiń do tej tury": przycisk nazywa wtedy cel
  (`PRZEWIŃ DO T6`), więc widać, dokąd skoczy czas, zanim się go ruszy.

Jedna kontrolka, bo obie postacie robią dokładnie to samo — rozstrzygają ciąg tur bez zmiany
nastaw — i różnią się wyłącznie warunkiem zatrzymania. Pasek raportu zostaje przez to czystym
odczytem: opisuje turę, nie działa na nią.

W przewijanych turach nastawy pozostają bez zmian — przewijanie to świadome przyjęcie ryzyka,
nie darmowe pominięcie. Po zatrzymaniu wybór wraca na turę ostatnio rozstrzygniętą (§2.3),
czyli na tę, która przewijanie zatrzymała. Tempo gry z przewijaniem: **rok gry ≈ 2–2,5 h
przy stole** — podgląd jest opcjonalny i nie wchodzi do tego budżetu.

### 2.6 Czasy budowy (K ≈ 40; linie 3–12 h na heks wg typu)

Pierwotna zasada zachowania proporcji (K ≈ 5: jądrowa 2 lata przy wzroście 10%/rok ≈ ten
sam zakład co realnie 10 lat przy 2%/rok) **nie przetrwała prototypu**: przy K ≈ 5 czekanie
na budowy dominowało rozgrywkę — gracz przewijał całe miesiące bez żadnej decyzji. Wersja
0.11 skróciła czasy ×4 (K ≈ 20); granie w prototyp pokazało, że to nadal za wolno.

**DECYZJA (0.12): czasy budowy skrócone ponownie ×2 (K ≈ 40).** Jądrowa = 9 dób gry
(~3 miesiące gry), węgiel 5 dób, CCGT 3 doby; pełny katalog w §5. **Linie przesyłowe budują
się w godzinach gry, w tempie zależnym od typu (0.13, §4.2): NN 3 h, SN 6 h, WN 12 h na
heks trasy** — postęp nalicza się długością rozegranego bloku (3 h), więc linia NN powstaje
heks na turę, a magistrala WN wymaga 4 tur na heks. Świadomy kompromis: zakład „budowa vs
wzrost popytu" słabnie dalej (3 miesiące budowy ≈ +2,5% popytu), ale tempo gry wygrywa;
ponowne strojenie napięcia strategicznego — dokument 03/04.

**Rozbudowa linii chodzi tym samym zegarem** (0.17, §4.2): 70% czasu nowej linii docelowego
typu, więc NN→SN to 4,2 h, a NN→WN 8,4 h na heks trasy — z tą różnicą, że korytarz przez
cały ten czas przesyła na starym typie i nie ma przerwy w dostawie.

Czasy budowy obiektów — w §5 przy katalogach. Rozpoczętej budowy nie da się bezkosztowo
porzucić (anulowanie = utrata poniesionych nakładów) — dotyczy to również rozpoczętej
rozbudowy linii: po anulowaniu linia zostaje na starym typie, a wpłacone pieniądze przepadają.

### 2.7 Kampania bez końca

**DECYZJA: kampania jest nieskończona** — piaskownica bez zadanego horyzontu. Gracz kończy,
kiedy chce, albo gdy uzna cele z §9 za osiągnięte. Nie ma wariantów długości.

Przy stałym wzroście procentowym liczby rosłyby wykładniczo, a mapa ma skończoną liczbę
miast — wzrost musi się długofalowo wysycać. **DECYZJA (0.14): mechanizm wzrostu miast
definiuje [dokument 05](05-model-zapotrzebowania.md) §6** (uchyla tymczasową formułę
logistyczną z 0.13): przy pełnym zasilaniu wzrost losowy 0–4%/mies., osobno dla gospodarstw
domowych i firm, tłumiony logistycznie względem pojemności (**16× stan startowy**,
parametr); niedobory kurczą miasto (sprzężenie z jakością zasilania). Przy suficie wzrost
zamiera; pełna mapa zbiega do ~20–30 GW (§3.4) bez twardego progu.

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

Mnożniki kosztu terenu — tabela w 02 §8.1 (0.16). Linie mogą przechodzić przez wodę:
jezioro ×2,5, morze ×3,5 (kabel podwodny).

**Budowa na wodzie — DECYZJA (0.22):** na morzu wolno postawić **wyłącznie farmę
wiatrową** (mnożnik ×2,5, §5.2). Każdy inny obiekt — elektrownia, PV, magazyn, stacja
rozdzielcza, przyłącze graniczne — na wodzie nie stoi, a na **jeziorze nie stoi nic**
(zbyt małe, a w grze to woda dla szczytowo-pompowej). Klasa wiatrowa heksa morskiego jest
morska (06 §6.1), więc różnicę robi sam teren — turbina jest ta sama co na lądzie.

*(Odłożone właściwości: cieki wodne i chłodzenie bloków, złoża paliw, ograniczenia terenowe
typu park narodowy — 90 §2.)*

### 3.3 Obiekty i topologia sieci

- **Punktowe** (zajmują heks): elektrownie, farmy OZE, magazyny, **stacje rozdzielcze**,
  miasta, punkty graniczne (krawędź mapy).
- **Liniowe**: linie przesyłowe biegnące łańcuchem heksów. Koszt = długość trasy × koszt/km
  × mnożniki terenu. Trasuje gracz albo automat („najtańsza trasa") z ręczną korektą.

**Zasada topologii — DECYZJA (0.11, zastępuje topologię stacyjną z 0.8–0.10):**

```
[elektrownia] ══linia══ [miasto] ══linia══ [STACJA ROZDZIELCZA] ══linia══ [...]
```

- **Linie łączą obiekty bezpośrednio** — elektrownię z miastem, farmę z magazynem itd.
  Każdy obiekt jest węzłem sieci; osobnego przyłącza nie ma.
- **Końcem trasy może być obiekt gotowy albo dopiero budowany** (0.23). Cel wskazuje się
  na mapie tak samo w obu przypadkach; plac budowy rezerwuje przyłącza od razu, więc nie
  zbierze więcej końców linii, niż gotowy obiekt będzie miał gniazd. Dzięki temu linia
  i obiekt powstają równolegle i **obiekt staje gotowy do pracy w dniu ukończenia**, a nie
  kilka dób później — co od 0.23 ma cenę (§4.1, §5.2).
- Każdy obiekt ma **6 przyłączy liniowych** — po jednym z każdego sąsiedniego heksa
  (0.12; wcześniej 2 — za mało, krępowało topologię). Każdy obiekt może więc zbierać
  i rozdzielać linie. **Stacja rozdzielcza** pozostaje wyspecjalizowanym węzłem sieci,
  ale wyróżnia ją już tylko liczba przyłączy: **12, na sztywno** (0.21; wcześniej
  6 +2 za moduł do 18) i żadnej własnej przepustowości — buduje się ją tam, gdzie
  korytarze mają się łączyć z dala od istniejących obiektów (§4.3).
- **Linia przechodząca przez heks z obiektem automatycznie go przyłącza** (0.13) —
  **i jest na nim przerywana** (0.19): gotowa linia nigdy nie *mija* obiektu, tylko
  rozpada się na dwie osobne linie, obie kończące się w nim. Obiekt jest więc węzłem
  trasy w samym stanie gry, nie tylko w grafie rozpływu (02 §2), a każdy z odcinków
  można osobno rozbudować i osobno anulować. **Przelot zajmuje dwa przyłącza**
  (wejście i wyjście — po jednym z każdego sąsiedniego heksa; do 0.18 liczyło się
  jedno). Jeśli mijany obiekt nie ma tylu wolnych przyłączy, trasa przez ten heks jest
  niedozwolona — trzeba ominąć.
- **Przerwanie działa w obie strony** (0.19): postawienie obiektu na heksie, przez który
  biegną już linie, przecina je wszystkie w dniu ukończenia budowy. Dlatego heks, którego
  korytarz przyniósłby więcej końców niż obiekt ma przyłączy (np. 4 linie w przelocie =
  8 końców przy 6 przyłączach zwykłego obiektu; stacja rozdzielcza ma ich 12 i ten sam
  korytarz przyjmie), **nie jest placem budowy** — silnik nigdy nie przetrasuje
  linii, za którą gracz już zapłacił. Linia w budowie zostaje jednym zleceniem z jednym
  odliczaniem i przecina się dopiero w chwili uruchomienia (§2.6).
  Suma długości, kosztu stałego i przepustowości nie zmienia się przy przecięciu:
  heks obiektu kończy jeden odcinek i zaczyna następny.
- **Limit korytarza:** przez jeden heks może biec **najwyżej 9 linii jednego typu** (0.13).
- Punkt graniczny wymaga zbudowania przyłącza granicznego, które jest węzłem z własną
  przepustowością (§5.7).
- **Przyłączenie miasta** = doprowadzenie gotowej linii do miasta + akt przyłączenia
  (§3.4; koszt aktu ~15 mln zł, parametr).

**Uchylona decyzja 0.9:** „promień obsługi stacji = 1 heks" i „linie tylko między stacjami" —
dawna topologia stacyjna czeka w 90 §4 (kandydatka do powrotu razem z poziomami napięć).

### 3.4 Stan początkowy — minimalny stan posiadania

**DECYZJA (0.10, zastępuje czysty greenfield z 0.3): gracz zawsze zaczyna z minimalnym
stanem posiadania** — od pierwszej tury na mapie działa mały system: **jedna elektrownia
średniej wielkości (np. CCGT ~400 MW), linia i jedno przyłączone małe miasto**.
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
- **Przyłączenie to akt gracza**: doprowadź do miasta gotową linię i załącz (topologia
  bezpośrednia — §3.3, stacja nie jest wymagana). Od tej chwili miasto płaci za energię,
  ale też **trwale dokłada swoje zapotrzebowanie** — odłączyć się nie da.
- Pierwsza decyzja strategiczna: **rozbudować zalążek** (druga jednostka, magazyn), czy
  **ciągnąć sieć** do kolejnego miasta.

Minimalny start pełni rolę samouczka: na początku to jedna elektrownia i jedno miasto,
złożoność narasta w tempie, w jakim gracz sam ją buduje. **Krzywa trudności jest emergentna.**

**DECYZJA (bez zmian): kapitał startowy = 10 mld zł** (parametr scenariusza). Przy starcie
z zalążkiem kapitał w całości finansuje pierwszą falę rozbudowy; czy nie jest wtedy zbyt
komfortowy — do weryfikacji w dokumencie 03.

**DECYZJA (bez zmian): skala systemu wynika z przyłączonych miast** — od ~1 GW szczytu
w pierwszych latach do **20–30 GW** w późnej grze (wzrost miast wg dokumentu 05 §6
+ kolejne przyłączenia).

---

## 4. Rdzeń mechaniki — bilans turowy i przepływ „wodociągowy"

To jest serce wersji uproszczonej. Wszystko inne jest wokół tego zbudowane.

### 4.1 Równanie tury

W każdej turze suma zapotrzebowania przyłączonych miast musi zostać pokryta (wielkości
w MW są **średnimi bloku tury**; energia i pieniądze = moc × 3 h, §2.2):

```
POKRYCIE:  produkcja sterowalna + produkcja OZE (z pogody) + rozładowanie magazynów + import
ZUŻYCIE:   zapotrzebowanie miast + ładowanie magazynów + eksport + straty przesyłowe
```

> **Przykład.** Tura SZCZYT WIECZORNY (18–21) w listopadzie, zapotrzebowanie trzech miast
> łącznie **1500 MW**.
> Prognoza wiatru: 320 MW ±60. Gracz nastawia: węgiel 800 MW, gaz 250 MW, rozładowanie
> magazynu 100 MW, import 100 MW — razem ze spodziewanym wiatrem ~1570 MW na pokrycie
> 1500 MW plus ~45 MW strat. Rozstrzygnięcie: wiatr wchodzi 280 MW (dolna część pasma),
> PV = 0 (po zachodzie). Dostarczone: 1485 MW → **15 MW niedoboru** w najdalszym mieście.
> Raport: kara + notatka, że zabrakło zapasu na dolne pasmo prognozy.

- **Każda nadwyżka jest karana — 400 zł/MWh, niezależnie od źródła (0.23, 02 §5;
  uchyla darmowy zrzut OZE z 0.16).** Podstawą kary jest suma tego, czego rozpływ nie
  odebrał: nastawa sterowalnych ponad wykorzystanie **plus** produkcja OZE ponad
  wykorzystanie. Cel tury jest przez to symetryczny: pokryć zapotrzebowanie i **nie
  produkować ponad nie**. Paliwo płaci się tylko od energii wykorzystanej (zrzucona MWh
  nie pali paliwa, ale jest karana); import jest take-or-pay (płatny od nastawy).
- **Produkcja OZE jest niesterowalna** — wynika z pogody, więc jej nadwyżkę przycina
  automatyka. Rozpływ używa OZE pierwsze (koszt 0), zatem OZE jest przycinane **ostatnie**
  i kara sięga po nie dopiero, gdy pogoda przerasta cały odbiór sieci albo gdy wąskie
  gardło odcina farmę. Jedyna ręczna kontrola gracza (0.13): **wyłączenie/włączenie całej
  farmy** — częściowego zadawania mocy OZE nie ma, a farma wyłączona nie produkuje i nic
  nie jest winna.
- **Nadwyżkę zawsze opłaca się zagospodarować, nie zrzucić** (02 §5.2): ładowanie
  magazynu i eksport liczą się jako odbiór, więc karę znoszą.
- **Niedobór** — patrz §4.5.

### 4.2 Linie: przepustowość i straty

Analogia obowiązująca w całym silniku: **sieć działa jak wodociąg**. Linia to rura —
ma maksymalny przepływ i gubi część tego, co płynie, proporcjonalnie do długości:

```
moc_odebrana = moc_nadana × (1 − k_strat · długość_km / 100)
```

**DECYZJA (0.13, uchyla „jeden typ linii" z 0.11): trzy typy linii przesyłowych** —
umowne poziomy napięć (realne odpowiedniki ~110/220/400 kV):

| Typ | Maks. przesył | Straty /100 km | Koszt budowy | Czas budowy (§2.6) |
|---|---|---|---|---|
| **Niskie napięcie (NN)** | 150 MW | 4% | ~0,6 mln zł/km | 3 h/heks |
| **Średnie napięcie (SN)** | 500 MW | 2% | ~1,25 mln zł/km | 6 h/heks |
| **Wysokie napięcie (WN)** | 1500 MW | 1% | ~3 mln zł/km | 12 h/heks |

*(wartości orientacyjne, do strojenia w dokumencie 04; długość = liczba heksów trasy
× 25 km; koszt × mnożnik terenu)*

Wszystkie typy wpinają się w te same przyłącza obiektów — transformacji NN/SN/WN nie
modelujemy (90 §4). Przez jeden heks biegnie ⩽9 linii jednego typu (§3.3). Drugi tor
= osobna linia na tej samej trasie.

**DECYZJA (0.17): gotową linię można rozbudować do wyższego typu** — NN→SN, NN→WN, SN→WN.
Nigdy w dół; linii w budowie nie da się rozbudować (najpierw dokończ albo anuluj) i jedna
linia prowadzi naraz jedną rozbudowę. Cena i czas wg reguły rozbudowy z §7 (02 §8.4):
**85% CAPEX-u i 70% czasu** nowej linii docelowego typu na tej samej trasie, z mnożnikami
terenu. Postęp nalicza się jak przy budowie — długością rozegranego bloku (§2.6). Przez całe
roboty **linia pracuje na starym typie** (stara przepustowość, stare straty, stary koszt
stały). Przeskok na nowy typ księguje się na koniec tury, w której wypracowano ostatnią
godzinę, więc pierwszą turą przesyłu na nowej przepustowości jest tura następna — dokładnie
jak przy nowej linii, która zaczyna przesyłać w turze po zakończeniu budowy (§2.6). Linia
w trakcie rozbudowy zajmuje miejsce w korytarzu **dla obu typów** — starego i docelowego (§3.3).

Co rozbudowa daje ponad dołożenie równoległego toru: **straty spadają na całym korytarzu**
(4% → 2% → 1%/100 km — dokładanie torów nie poprawia strat ani o promil), maleje koszt stały
i zwalnia się przyłącze obiektu. Czego nie daje: przepustowości powyżej 1500 MW i sumowania
mocy — tor NN obok toru SN to 650 MW, podczas gdy rozbudowa NN→SN daje 500 MW.

*Świadoma konsekwencja dla zakładu opisanego niżej:* ścieżka „NN teraz, WN później" kosztuje
0,6 + 0,85 × 3,0 = **3,15 mln zł/km wobec 3,0 mln zł/km za WN od razu** — kara zaledwie 5%
(przy pełnym CAPEX-ie rozbudowy byłoby 20%), a prąd płynie cztery razy wcześniej. Budowanie
najtańszego typu i rozbudowa w miarę wzrostu jest więc strategią wyraźnie opłacalną i zakład
o przyszłość korytarza słabnie. Przyjęte świadomie, na rzecz jednej reguły rozbudowy w całej
grze; strojenie udziału (85% vs 100% CAPEX-u) — dokument 04.

Wynikające z tego decyzje gracza:

- **Elektrownia blisko miasta** = tania linia i małe straty, ale drogi teren. **Elektrownia
  daleko** (tani teren, dobry wiatr) = straty zjadają marżę co godzinę.
- **Wybór typu to zakład o przyszłość korytarza**: NN szybko i tanio spina bliskie obiekty,
  ale nie uniesie rosnącego szczytu; WN to droga, powolna magistrala „na zapas". Korytarz
  wymiaruje się typem i liczbą równoległych torów — za rok szczyt urośnie o 10%.
- Przykład skali strat (SN): trasa o długości 8 heksów (200 km) traci **4% przesyłanej
  mocy**. Żeby dostarczyć 300 MW, trzeba nadać 312,5 MW — różnicę gracz opłaca co godzinę.
  Ta sama trasa w NN traci 8%, w WN — 2%.

### 4.3 Stacje rozdzielcze: węzły zbiorczo-rozdzielcze bez własnej przepustowości

Stacja rozdzielcza to trójnik/rozdzielacz w wodociągu — **dedykowany węzeł sieci** do
łączenia korytarzy z dala od istniejących obiektów. Od 0.12 rozgałęziać może każdy obiekt
(6 przyłączy — §3.3); stację wyróżnia **12 przyłączy** i tyle.

**DECYZJA (0.21, uchyla przepustowość stacji z 0.12): stacja nie ogranicza mocy.**
Przepuszcza wszystko, co przyniosą do niej linie — jak trójnik, którego średnica nie bywa
mniejsza od rur, które spina. Dawna pułapka „grube linie, cienka stacja" (trzy korytarze
po 500 MW zebrane w stacji 250 MW) znika, bo była **dubletem limitu linii ustawionym
poniżej jego wartości**: stacja startowa 250 MW była węższa niż pojedyncza linia SN, więc
wstawienie jej w korytarz SN albo WN zawsze go zwężało. Gracz płacił za przepustowość tego
samego odcinka dwa razy, a narzędzie do łączenia korytarzy działało jak pułapka na
nieuważnego. Wąskim gardłem sieci zostaje **wyłącznie linia** — jej typ, liczba
równoległych torów i straty na długości (§4.2); własną przepustowość węzła ma już tylko
przyłącze graniczne, gdzie limit MW jest zdolnością handlową, a nie dubletem (§5.7).

Parametry — §5.4. *(Układy rozdzielni, kompensacja, poziomy napięć, dawna topologia
stacyjna — 90 §4; przepustowość węzła jako osobny wymiar wraca razem z DC power flow,
90 §1.)*

### 4.4 Model przepływu — transportowy, nie fizyczny

Silnik traktuje sieć jako **graf przepustowości** (obiekty = węzły, linie = krawędzie ze
stratami; własną przepustowość węzła ma od 0.21 już tylko przyłącze graniczne): znajduje
najtańszy wykonalny rozpływ od źródeł do odbiorów, zamiast liczyć fizyczny
rozpływ prądu. Gracz nie steruje trasami bezpośrednio — ustawia źródła, a energia „płynie
sama" najtańszymi dostępnymi drogami, jak woda pod ciśnieniem.

**DECYZJA: algorytm rozpływu = min-cost flow** w przybliżeniu **kolejnych najtańszych
ścieżek** (0.16): koszt dostarczenia = koszt zmienny źródła / sprawność trasy (straty
wliczone), najpierw maksymalizacja energii dostarczonej, przy remisie minimalizacja
kosztu; deterministyczne tie-breaki. Formalizacja (reprezentacja grafu, funkcja kosztu,
obsługa strat, priorytety przebiegów) — [dokument 02](02-model-symulacji.md) §2–4.

Kluczowa własność pierwotnej wizji przeżywa uproszczenie w łagodniejszej formie: **można mieć
dość mocy i mimo to nie dostarczyć jej tam, gdzie trzeba** — bo korytarz ma za małą
przepustowość, albo straty na długiej trasie zjadają nadwyżkę. Planowanie sieci
pozostaje grą samą w sobie, tylko bez praw Kirchhoffa.

*(DC power flow — przepływy kołowe i przeciążenia wynikające z fizyki — wraca jako poziom
„Standard": 90 §1.)*

### 4.5 Niedobór — energia niedostarczona

Jeśli pokrycie (po stratach i limitach sieci) nie wystarcza, brakująca energia staje się
**energią niedostarczoną** w konkretnych miastach. **Alokacja jest emergentna (0.16,
02 §6): konsumują najbliżsi** — niedobór kumuluje się w miastach najdalszych od źródeł,
za wąskimi gardłami i za innymi miastami:

- kara finansowa za każdą MWh niedostarczoną: **4 000 zł/MWh** (0.13; parametr do strojenia
  w doc 03). Wciąż wielokrotnie drożej niż jakakolwiek produkcja; pierwotne 10 000 zł/MWh
  tworzyło w prototypie nieodwracalną spiralę zadłużenia po jednym złym dniu,
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

| Technologia | CAPEX (0.25) | Czas budowy (doby gry) | Koszt zmienny | Rola |
|---|---|---|---|---|
| **Jądrowa** | ~10,5 mln zł/MW | 9 (~3 miesiące gry) | ~60 zł/MWh | tania podstawa; próg wejścia to dziś **rozmiar bloku i koszt stały**, nie cena zakupu |
| **Węgiel** | ~4,5 mln zł/MW | 5 | ~250 zł/MWh | podstawa |
| **Gaz CCGT** | ~2,75 mln zł/MW | 3 | ~350 zł/MWh | elastyczne wypełnienie |
| **Gaz OCGT** | ~1,5 mln zł/MW | 1 | ~600 zł/MWh | szczyt, mały i szybki w budowie; **nie zwraca się z marży** — to polisa od kary za niedobór (§4.5) |

**DECYZJA (0.24): blok ma jeden z czterech rozmiarów, nie dowolną moc.** Każda
technologia sprzedaje cztery szczeble — **MAŁY, ŚREDNI, DUŻY, WIELKI** — i nic pomiędzy.
Moc jest własnością technologii, nie wyborem gracza co do megawata; pytanie brzmi „który
blok postawić", a nie „ile dokładnie MW wpisać".

| Technologia | MAŁY | ŚREDNI | DUŻY | WIELKI | Cena bloku (nizina): MAŁY → WIELKI |
|---|---|---|---|---|---|
| **Jądrowa** | 800 MW | 1 200 MW | 1 600 MW | 2 400 MW | 8,4 → 25,2 mld zł |
| **Węgiel** | 200 MW | 500 MW | 750 MW | 1 000 MW | 0,9 → 4,5 mld zł |
| **Gaz CCGT** | 100 MW | 200 MW | 400 MW | 500 MW | 275 mln → 1,375 mld zł |
| **Gaz OCGT** | 50 MW | 75 MW | 100 MW | 150 MW | 75 → 225 mln zł |

**Rozmiar jest względny wobec technologii, nigdy bezwzględny:** MAŁY blok jądrowy
(800 MW) jest o połowę większy od WIELKIEGO bloku CCGT (500 MW), a WIELKI blok OCGT
(150 MW) jest mniejszy od MAŁEGO gazowego CCGT. Nazwa mówi tylko o miejscu na drabinie
swojej technologii — dlatego katalog zawsze drukuje obok niej moc w MW (§8 pkt 6).

**Drabina nie pozwala „spróbować jądrówki w małej skali"** — najmniejszy blok to
800 MW i tego reguła pilnuje. Nie pilnuje już natomiast portfela: po cięciu CAPEX-u
z 0.25 kosztuje on **8,4 mld zł, czyli mniej niż kapitał startowy** (§3.4), więc silnik
przyjmie takie zamówienie w pierwszej turze gry. Barierą jest **to, co blok przynosi ze
sobą**: koszt stały **400 mln zł rocznie** płacony niezależnie od pracy (02 §8.3), brak
odbioru dla 800 MW przy zalążku o szczycie kilkudziesięciu MW i osobna inwestycja
w wyprowadzenie mocy. Jądrówka na starcie jest więc **błędem gracza, nie odmową
silnika** — czy ta bariera wystarcza, weryfikuje doc 03. Turbina szczytowa OCGT
pozostaje najtańszą wejściówką (75 mln zł za blok MAŁY) i to ona jest odpowiedzią na
pierwszy szczyt, którego nie domyka zalążek.

**Zwroty przy taryfie 650 zł/MWh po cięciu z 0.25:** wiatr lądowy **1,3** · PV **1,5** ·
wiatr morski **1,8** · węgiel **2,4** · jądrowa **2,7** · CCGT **2,9 roku**. Cięcie było
jednolite dla całego katalogu, więc **kolejność jest ta sama co przed nim** — OZE zwraca
się szybciej, sterowalne kupuje się za pewność, nie za tempo zwrotu. Zmieniło się
wyłącznie tempo: każda pozycja zwraca się dwa razy szybciej niż do 0.24.

**Górny koniec drabiny jądrowej jest problemem sieciowym, nie tylko budżetowym:** blok
WIELKI ma 2 400 MW, a najgrubsza linia (WN) przenosi 1 500 MW (§4.2) — pełnego bloku nie
wyprowadzi jeden tor, a sześć takich bloków na heksie (limit §7) to 14 400 MW, czyli
połowa docelowej skali całego systemu (§3.4). Jądrówka jest więc decyzją o topologii
korytarza, a nie tylko o pieniądzach.

*(wartości orientacyjne, do strojenia w dokumentach 03–04; wodna przepływowa i biomasa —
90 §2)*

### 5.2 OZE — wiatr i słońce

Źródła pogodozależne: **koszt zmienny ~0**, produkcja **niesterowalna** — wynika z pogody
wyznaczanej przez [dokument 06](06-model-astronomiczny-i-pogodowy.md) (krzywa mocy turbiny:
06 §6.3, produkcja PV: 06 §5, reżimy pogodowe: 06 §8). Można je tylko przycinać — a od 0.23
**przycięcie kosztuje 400 zł/MWh jak każda inna nadwyżka** (§4.1), więc włącznik farmy
przestaje być formalnością: flota OZE bez sieci i magazynów, które ją odbiorą, jest
kosztem, nie kapitałem.

**Stan startowy farmy (0.23):** farma ukończona na heksie, przy którym **nie ma gotowej
linii**, wchodzi do gry **wyłączona** — inaczej płaciłaby karę za nadwyżkę od pierwszej
tury swojego istnienia, nie mając dokąd oddać ani jednej MWh. Linia ukończona tego samego
dnia liczy się jako połączenie. Farma z wyprowadzeniem mocy wchodzi **włączona** i od razu
pracuje. Włączenie po fakcie jest zwykłą akcją gracza — automatu, który sam zapala farmę
po dociągnięciu linii, nie ma. Pozostałe obiekty startują z nastawą zero i reguła ich
nie dotyczy.

| Technologia | Typowa farma | CAPEX | Czas budowy (doby gry) | Roczny CF (kontrola: 06 §12) | Charakter |
|---|---|---|---|---|---|
| **Wiatr lądowy** | 50–300 MW | ~1,8 mln zł/MW | 1 | ~15–30% (zależnie od heksa) | najmocniej wieje zimą; **wyłączenie sztormowe przy 25 m/s** |
| **Wiatr morski** (0.22) | 100–600 MW | ~4,5 mln zł/MW (×2,5 za teren) | 2 | ~47% | ta sama turbina, klasa wiatrowa morska; **płaska sezonowość**, ale sztorm gasi ją pierwszą |
| **PV** | 10–200 MW | ~0,9 mln zł/MW | 1 | ~11–12% | szczyt w letnie południe, **zero w nocy**; grudzień = ~8–10% czerwca |

**Wiatr morski to nie osobna technologia (0.22)** — to ta sama farma postawiona na heksie
morskim (§3.2). Silnik nie zna „turbiny morskiej": zna jedną technologię `wiatr`, a różnicę
robią trzy właściwości terenu — mnożnik CAPEX-u ×2,5, limit heksa 600 zamiast 300 MW
i 2 doby budowy zamiast 1 (§7, 02 §8.1, §8.4). Produktywność bierze się skądinąd: heks
morski ma klasę wiatrową morską (06 §6.1) i to ona daje CF ~47% zamiast ~26%.

Dwa wpisane w fizykę zjawiska, które są rdzeniem trudności (nie wymagają osobnych mechanik
„zdarzeń" — wynikają z reżimów pogodowych 06 §8.2):

- **Dunkelflaute** — zimowy wyż: wiatr ~0, PV śladowe, zapotrzebowanie na maksimum, przez
  kilka dób z rzędu (reżim miesięczny, §2.1). Test, dla którego istnieją magazyny, szczyt
  gazowy i import.
- **Sztorm** — najpierw nadprodukcja wiatru, potem kaskadowe wyłączenia turbin przy 25 m/s.

Tanie MWh z OZE są kuszące (koszt zmienny ~0 przy taryfie 650 zł/MWh), ale niepewne
i wymagają zabezpieczenia mocą sterowalną, magazynem lub importem — to jest właściwa decyzja
portfelowa gry. **Morze tego nie zmienia** (0.22): daje więcej energii bazowej i zasypuje
letnią zapaść wiatru, ale w Dunkelflaute stoi tak samo jak ląd, a w sztormie gaśnie przed
nim — pomiar i test w 06 §12.14. *(Dalsze poziomy oddalenia od brzegu, HVDC, wiatr na
jeziorach — 90 §2.)*

### 5.3 Magazyny energii

Magazyn rozdziela dwa parametry, które gracz musi rozumieć osobno: **moc [MW]** (jak szybko
oddaje/pobiera) i **pojemność [MWh]** (ile mieści). Bateria 100 MW / 200 MWh oddaje pełną
moc przez 2 godziny. UI musi to wyraźnie pokazywać.

| Typ | Sprawność cyklu | Typowy stosunek pojemność:moc | Budowa (doby gry) | Wymagania terenu |
|---|---|---|---|---|
| **Bateria (BESS)** | ~90% | 1–4 h | 1 | brak — wszędzie |
| **Szczytowo-pompowa** | ~75% | 6–20 h | 5 | góry/wyżyna + woda (§3.2) |

**CAPEX (0.16, ceny z 0.25; 02 §8.2):** bateria — moduł mocy **0,8 mln zł/MW** + moduł
pojemności **0,55 mln zł/MWh** (kupowane osobno; limit 500 MW / 2 000 MWh na heks); szczytowo-pompowa —
bloki **250 MW / 2 500 MWh** po **~550 mln zł** (do 4 bloków na heksie).

Moc i pojemność baterii rozbudowuje się **osobno** (moduły). Zastosowania w wersji
uproszczonej: przenoszenie taniej energii (nocna jądrowa/węgiel, nadwyżki wiatru) na szczyt
oraz **bufor na błąd prognozy** — magazyn z zapasem energii to polisa na dolne pasmo wiatru.

### 5.4 Stacje rozdzielcze

Rola w topologii — §3.3, mechanika węzła — §4.3. Parametry (orientacyjne, do strojenia):

| Parametr | Wartość | Rozbudowa |
|---|---|---|
| **Przepustowość** | brak limitu (0.21) | — |
| **Przyłącza liniowe** (ile linii można wpiąć) | 12 | — (bez modułów od 0.21) |
| CAPEX / czas budowy | ~30 mln zł, 1 doba gry | — |

Cena to mniej więcej **jeden heks linii SN** (31,25 mln zł): stacja zwraca się w chwili,
gdy oszczędza jeden heks zdublowanego korytarza. Jest więc rutynowym elementem topologii,
a nie inwestycją — jedyne pytanie brzmi „czy potrzebuję tu rozgałęzienia". Braku limitu
mocy nie da się nadużyć: przez stację przepłynie tylko tyle, ile wniosą linie, a te są
droższe od niej.

*(Układy rozdzielni, kompensacja mocy biernej, telemechanika, poziomy napięć i dawna
topologia stacyjna z przyłączem w promieniu 1 heksa — 90 §4.)*

### 5.5 Linie przesyłowe

Katalog i mechanika — §4.2. Drugi tor na tej samej trasie = osobna linia (można dobudować).

### 5.6 Miasta

**DECYZJA (0.14): miasto opisują dwie liczby stanu — gospodarstwa domowe i firmy**
([dokument 05](05-model-zapotrzebowania.md) §2); każdy segment ma własny profil godzinowy
i zużycie jednostkowe (05 §3). **Klasa wielkości** pozostaje etykietą pochodną od szczytu
zapotrzebowania (małe ~50–150 MW, średnie ~150–500 MW, duże ~500–1500 MW; kalibracja
liczby jednostek — 05 §5).

- **Profil dobowy — emergentny z segmentów** (05 §3.3): szczyt wieczorny (18–19),
  garb przedpołudniowy ~90% szczytu, dolina nocna ~48% szczytu; doba wolna — energia
  ~82% doby roboczej, szczyt ~90% szczytu roboczego (firmy schodzą do poboru bazowego).
- **Sezonowość i pogoda:** mnożnik miesięczny od ~0,85 (maj) do ~1,15 (styczeń) oraz
  temperaturowa krzywa „V" — tabele i formuły w 05 §4; reżim pogodowy modyfikuje popyt
  (mróz podnosi — 06 §8.2, §9).
- **Wzrost i kurczenie:** miesięczna ocena dostarczenia — 05 §6 (0.14; uchyla formułę
  tymczasową z 0.13); do tego skokowe przyrosty przy przyłączaniu kolejnych miast.
- Prawdziwe zapotrzebowanie tury ≠ prognoza (§2.4) — błąd σ_popyt wg 06 §8.6.2.

*(Segmenty dodatkowe — przemysł ciężki, DSR, prosumenci — 90 §9.)*

### 5.7 Punkty graniczne — import i eksport

Na krawędziach mapy leżą **punkty graniczne**. Żeby handlować, gracz buduje **przyłącze
graniczne** (interkonektor — od 0.21 jedyny węzeł z własną przepustowością; limit MW
jest tu zdolnością handlową, nie dubletem limitu linii) i dociąga do niego linię:

| Parametr | Wartość orientacyjna |
|---|---|
| CAPEX przyłącza | ~0,5 mld zł za 500 MW zdolności (moduł +500 MW: ~0,35 mld zł) |
| Czas budowy | 4 doby gry (moduł: 2 doby) |
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

- **Przychód:** każda MWh **dostarczona** do miast × stała taryfa (**650 zł/MWh** — 0.13,
  wartość wystrojona graniem; parametr scenariusza, weryfikacja w doc 03). Straty przesyłowe
  nie są opłacane — gracz płaci za nie paliwem.
- **Koszty zmienne:** paliwo od energii **wykorzystanej** (0.16 — zrzucona MWh nie pali
  paliwa, ale jest karana, §4.1); import take-or-pay (płatny od nastawy). OZE nie ma
  kosztu zmiennego, ale od 0.23 ma karę za nadwyżkę.
- **Koszty stałe:** utrzymanie obiektów [zł/MW/rok], naliczane dobowo (roczne/365 × liczba
  reprezentowanych dni doby); tabela stawek — 02 §8.3 (0.16).
- **Kary:** energia niedostarczona (§4.5) oraz **nadwyżka — 400 zł/MWh od sumy
  niewykorzystanej produkcji wszystkich źródeł, sterowalnych i OZE** (0.23; §4.1, 02 §5).
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
- **Rozbudowa nie wykracza poza heks (0.13):** obiekt zawsze zajmuje dokładnie jeden heks;
  rozbudowa dodaje bloki/moduły w jego obrębie — to „ulepszenie" obiektu, nie ekspansja
  terenowa.
- **DECYZJA (bez zmian): istniejące obiekty można rozbudowywać, z twardym limitem lokalizacji:**
  elektrownia do **6 bloków** na heksie (0.16), farma OZE do limitu mocy heksa (**wiatr
  300 MW na lądzie i 600 MW na morzu — 0.22, PV 200 MW** — 02 §8.4), magazyn do limitu
  modułów (moc i pojemność osobno — 02 §8.2), przyłącze graniczne o kolejne moduły
  zdolności (**stacji rozdzielczej nie rozbudowuje się wcale — od 0.21 nie ma czego,
  §5.4**). Rozbudowa = **70% czasu i 85% CAPEX-u** nowej lokalizacji (0.16, przygważdża
  widełki z 0.13). Po osiągnięciu limitu jedyną drogą jest nowa lokalizacja.
- **Limit i czas budowy zależą od terenu, nie tylko od technologii (0.22):** farma wiatrowa
  mieści na heksie morskim 600 MW zamiast 300 i stawia się 2 doby zamiast 1 (§5.2). Baza
  rozbudowy jest ta sama co przy nowej lokalizacji — 85% CAPEX-u i 70% czasu **liczonego
  od terenu heksa, na którym farma już stoi**, więc dostawienie 300 MW na morzu kosztuje
  85% z 1,35 mld zł i trwa 70% z 2 dób.
- **Linia rozbudowuje się przez podmianę typu (0.17):** gotową linię podnosi się do wyższego
  typu na tej samej trasie za **85% CAPEX-u i 70% czasu** nowej linii tego typu (§4.2); przez
  całe roboty przesyła dalej na starym typie. Trasy ani długości rozbudowa nie zmienia — to
  ta sama „rozbudowa w miejscu" co blok na heksie elektrowni. Powyżej WN nie ma dokąd
  rozbudowywać: zostaje równoległy tor.
- **Dostawiany blok wybiera się z tej samej drabiny czterech rozmiarów co nowy** (0.24,
  §5.1) i **nie musi** być równy blokom już stojącym na heksie: do 400 MW CCGT wolno
  dostawić szczebel MAŁY (100 MW) albo WIELKI (500 MW). Panel podpowiada szczebel
  najbliższy średniemu blokowi obiektu — obiekt ze stanu startowego albo starego zapisu
  może mieć moc spoza drabiny, a rozbudowa musi mimo to nazwać rozmiar.
- Nowy blok ma własny licznik budowy; linie można dobudowywać równolegle na tej samej trasie
  — drugi tor zawsze pozostaje osobną linią, także po rozbudowie pierwszego.

*(Malejące przychody krańcowe na farmach — wake effect, ryzyko koncentracji, opór społeczny,
starzenie majątku i remonty, kolejka przyłączeniowa — 90 §3, §7, §10.)*

---

## 8. Interfejs (wersja uproszczona)

1. **Mapa** — heksy, obiekty, linie w kolorach obciążenia (zielony → żółty → czerwony);
   miasto w niedoborze gaśnie/miga. **Mapa pokazuje zawsze turę ostatnio rozstrzygniętą
   i nie cofa się razem ze wstęgą czasu** (0.18): sieć sprzed miesiąca to inny świat —
   inne linie, inne obiekty, część dzisiejszych jeszcze nie istniała — więc malowanie
   starych przepływów na dzisiejszej mapie kłamałoby.
2. **Wstęga czasu** (0.18; do 0.17 „oś tur" + „wykres doby" osobno) — oś tur i wykres
   pokrycia zlane w **jeden pas przewijany lewo-prawo**, o wspólnej osi X w jednostce
   tury (3 h, §2.2). Doba to nadal 8 tur; wstęga pokazuje ich naraz więcej niż osiem,
   z czytelnymi separatorami dób i podpisem doby (miesiąc, typ doby).
   - **Za nami** — zapotrzebowanie (prawda) vs pokrycie warstwami
     (jądrowa/węgiel/gaz/wiatr/PV/magazyn/import), **bez pasma prognozy sprzed tury**
     (0.20; obowiązywało w 0.18–0.19). Rozstrzygnięta tura mówi na wykresie, co się
     stało; z czym się to rozminęło, mówią liczby paska raportu — tam zakład i wynik
     stoją obok siebie co do MW, zamiast dokładać kreski do stosu siedmiu warstw.
   - **Przed nami** — prognoza popytu z pasmem, do granicy horyzontu (§2.4), **plus plan
     przy obecnych nastawach: te same warstwy co za nami** (0.20). Plan bierze nastawy
     elektrowni, importu i magazynów (moc magazynu ograniczona bieżącym SOC), a wiatr
     i PV z prognozy produkcji — i **nie jest przycinany do popytu**: część stosu ponad
     prognozą popytu to zrzut, który tura ukarze (§4.1), a luka pod nią to niedobór,
     który gracz ma jeszcze czym domknąć. Jest przy tym **ślepy na sieć**, dokładnie jak
     kolumna „bilans przy obecnych nastawach" (pkt 3): bez limitów linii i bez strat.
     Za granicą horyzontu wstęga się kończy.
   - **Plan rysuje się szrafurą, prawda pełnym wypełnieniem** (0.20): ta sama geometria
     i te same kolory technologii po obu stronach TERAZ, więc stos przed nami czyta się
     tak samo jak stos za nami — a tekstura mówi, że to zakład, nie pomiar. Do tego plan
     stoi **o krok od pełnej saturacji i pełnego wypełnienia** — tyle wyszarzenia, żeby
     przestał konkurować z prawdą obok, i ani trochę więcej: kolor warstwy jest w tym
     wykresie informacją (merit order), a stos wyszarzony do końca przestaje odpowiadać
     na pytanie, z czego plan jest złożony.
   - Prawda za nami jest rysowana blokami tur: wartość tury trzyma poziom przez środek
     swojego bloku, a łagodnie przechodzi w sąsiednią dopiero przy granicy bloku. To
     wyłącznie zabieg wizualny — tura nadal jest **płaską średnią 3 h** (§2.2), silnik
     niczego wewnątrz bloku nie interpoluje, a odczyt wartości bierze się ze środka bloku.
     Plan przed nami idzie tymi samymi blokami (nastawa jest stała w turze); krzywą
     godzinową zostaje sama prognoza popytu.
   - **Klik w turę = podgląd** (§2.5). Tura wybrana jest zaznaczona na wstędze; powrót
     do teraz jest jednym kliknięciem i dzieje się sam przy każdym ruchu czasu.
   - **Historia jest trwała**: każda rozstrzygnięta tura zostawia w stanie gry **skrót**
     (wynik finansowy, pokrycie warstwami, zakład z prognozą, miasta w niedoborze) —
     wystarczający dla wstęgi i paska raportu, i tani na tyle, by trzymać go bez limitu
     (02 §4.1). Pełny raport tury — z przepływami per segment i węzeł — pozostaje tylko
     dla tury ostatniej; to on zasila mapę (pkt 1) i warunki stopu przewijania (§2.5).
3. **Panel prognozy** — pasma popytu i OZE na kolejne godziny + kolumna **„bilans przy
   obecnych nastawach"** (czy plan przeżyje najbliższe 6 h — 06 §8.6.4).
4. **Panel nastaw** — jednostki z suwakami, magazyny (ładuj/oddawaj), import/eksport,
   saldo bilansu. **DECYZJA: bez auto-nastaw** — wszystkie nastawy ustawia gracz ręcznie,
   nie ma przycisku „obsadź najtaniej".
5. **Panel dyspozytora jest stale widoczny** (0.12) — prognoza, nastawy (edytowalne
   cały czas — §2.3), raport tury wybranej na wstędze oraz harmonogram budów i systemy
   prognostyczne; budżet i wynik doby w pasku górnym; przycisk **„następna tura"**
   — jedyna akcja przechodząca czas. Nie ma osobnej zakładki budowy.
   **Pasek raportu opisuje turę wybraną** (0.18, §2.3): dla tury rozstrzygniętej — jej
   wynik, dla tury przyszłej — kartę prognozy z pasmami. Zawsze nazywa turę, o której
   mówi, i zawsze widać, czy patrzy się na wynik, czy na zakład; sam pasek nie niesie
   żadnej akcji. Przycisk przewijania stoi obok „następnej tury" i przejmuje cel z wstęgi
   (§2.5) — obie akcje przechodzące czas są w jednym miejscu ekranu.
6. **Panel heksa (0.12, zastępuje okienko obiektu z 0.11)** — klik na **dowolny heks**
   (także pusty) otwiera panel dokowany przy prawej krawędzi mapy, nad jej częścią:
   parametry heksa (teren, mnożnik kosztu, wiatr/słońce, lokalizacja szczytowo-pompowa),
   **katalog budowy dostępny na tym heksie — jedyna droga budowania** (ceny z mnożnikiem
   terenu; blok elektrowni wybiera się spośród **czterech rozmiarów** — §5.1 w 0.24 —
   przechodząc szczeblami `−`/`+`, a nazwa szczebla stoi zawsze obok mocy w MW, bo sama
   nie mówi nic o wielkości bezwzględnej), a gdy stoi tu obiekt — jego parametry, stan
   bieżący (przepływ/obciążenie,
   pobór, SOC) i akcje kontekstowe (przyłączenie miasta, rozbudowa, **poprowadzenie
   linii**: klik „poprowadź linię stąd" + klik heksu obiektu docelowego, anulowanie
   budowy). Panel pokazuje też linie przechodzące przez heks.

**Handoff UI (`design_handoff_electronation_turn_ui/`) jest wskazówką wyłącznie wizualną** —
paleta, typografia, układ ekranu, styl mapy i kart. Zakres funkcjonalny gry wynika z tego
dokumentu: np. wskaźnik częstotliwości widoczny w handoffie **nie istnieje** w wersji
uproszczonej (wraca z 90 §1), a karty prognozy obowiązują; pasek 24 tur z handoffu staje
się wstęgą tur 3-godzinnych (§2.2, pkt 2) — jednostką jest tura, nigdy godzina, a jedna
doba to zawsze 8 komórek.

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
| OZE pozostałe: wodna, biomasa; hydrologia, złoża, strefy klimatyczne (**wiatr morski wszedł do gry w 0.22** — §5.2) | 90 §2 |
| Unit commitment: minima, rozruchy, remonty, starzenie majątku | 90 §3 |
| Stacje zaawansowane: układy rozdzielni, kompensacja, poziomy napięć, typy linii, topologia stacyjna | 90 §4 |
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
| ✅ | **Uproszczony przepływ (0.7/0.8)**: model „wodociągowy" — bilans turowy, przepustowości linii (od 0.21 tylko ich oraz przyłączy granicznych), straty liniowe od długości; bez praw Kirchhoffa | 4 |
| ✅ | **W wersji uproszczonej są: PV, wiatr lądowy, magazyny, stacje rozdzielcze, prognozy z błędem** (0.8); **od 0.22 także wiatr morski** — nie jako osobna technologia, lecz jako ta sama farma na heksie morskim | 5, 2.4 |
| ✅ | **Wiatr morski (0.22)**: farma wiatrowa wolno stawiać na morzu — mnożnik terenu **×2,5**, limit heksa **600 MW**, budowa **2 doby**, klasa wiatrowa morska (CF ~47%). Reszta obiektów na wodzie nadal niemożliwa, na jeziorze nic. Uzasadnienie ×2,5 zamiast ×3,5 od kabla i dowód, że morze nie rozbraja Dunkelflaute ani sztormu — nagłówek 0.22 oraz 06 §12.14 | 3.2, 5.2, 7, 02 §8.1 |
| ✅ | **Topologia bezpośrednia (0.11)**: linie łączą obiekty wprost; **6 przyłączy liniowych na obiekt** (0.12; wcześniej 2 i stacja jako jedyny węzeł zbiorczy); stacja rozdzielcza = dedykowany węzeł, od 0.21 **bez własnej przepustowości, 12 przyłączy na sztywno** i cena jednego heksa SN (30 mln zł od 0.25; uchyla 250 MW + moduły z 0.12); **linia w przelocie przyłącza mijane obiekty, ⩽9 linii jednego typu na heks** (0.13); **przelot przerywa linię na obiekcie — dwie osobne linie, dwa przyłącza** (0.19; uchyla „jedno przyłącze" z 0.13) | 3.3, 4.3 |
| ✅ | **Trzy typy linii przesyłowych NN/SN/WN** (0.13; uchyla „jeden typ" z 0.11): 150/500/1500 MW, straty 4/2/1%/100 km, budowa 3/6/12 h/heks | 4.2 |
| ✅ | **OZE: ręczne sterowanie tylko włącz/wyłącz całą farmę**; przycinanie nadwyżek automatyczne (0.13) | 4.1 |
| ✅ | **Horyzont prognozy: 24 h bazowo, poziomy wydłużają do 3 / 7 dób** i zwężają pasmo (0.13); **kroczący (0.18)** — liczony od tury bieżącej, nie do końca doby (uchyla „bieżąca doba" z 0.13); lekki buff poziomu podstawowego do weryfikacji w doc 03 | 2.4, 06 §8.6.3 |
| ✅ | **Wartości ekonomiczne = strojenie z prototypu (0.13)**: taryfa 650, kara 4 000 zł/MWh, CAPEX ~×0,6, graniczne 1,0 mld, przyłączenie miasta 30 mln — baseline dla doc 03. **Rabat ×0,6 objął wyłącznie OZE**; sterowalne dorównały mu dopiero w 0.25 (i to z nawiązką — cięcie o połowę) | 4.5, 5, 6 |
| ✅ | **Wszystkie ceny inwestycji o połowę niżej (0.25)**: elektrownie, OZE, magazyny, linie, stacje, granice, przyłączenie miasta, systemy prognostyczne — jednolicie ×0,5, więc relacje cenowe i kolejność zwrotów bez zmian (wiatr 1,3 → CCGT 2,9 roku), a gra przyspiesza dwukrotnie kapitałowo. Kapitał startowy zostaje 10 mld. Jądrówka mieści się w nim — jej progiem zostaje koszt stały i brak odbioru, nie cena | 4.2, 5.1–5.4, 5.7, 2.4 |
| ✅ | Pogoda wg dokumentu 06 (reżimy, prawda przy init doby, seed) | 2.4, 06 |
| ✅ | Skala czasu — 3 doby reprezentatywne na miesiąc (36 dób/rok) | 2.1 |
| ✅ | Gra turowa — **doba = 8 tur po 3 h** (tury nazwane od pór doby; prawda pozostaje godzinowa) (0.12) | 2.2 |
| ✅ | Prognoza z błędem zamiast stanu bieżącego — źródło napięcia | 2.4 |
| ✅ | Przewijanie tur sterowane przez gracza; **podgląd i przewijanie rozdzielone (0.18)** — klik = podgląd i nigdy nie rusza czasu; obie postacie przewijania to jeden przycisk przy „następnej turze", celowany wyborem na wstędze | 2.5, 8 pkt 5 |
| ✅ | **Start z minimalnym stanem posiadania** (elektrownia + sieć + jedno miasto, darmowe); pozostałe miasta niepodłączone | 3.4 |
| ✅ | Skala systemu ~1 GW → 20–30 GW, wynika z przyłączeń | 3.4 |
| ✅ | Waluta — złoty (PLN), parametr | 6 |
| ✅ | Przelicznik 25 km/heks | 3.1 |
| ✅ | Kapitał startowy 10 mld zł, konfigurowalny | 3.4 |
| ✅ | Czasy budowy K ≈ 40 (0.12; wcześniej K ≈ 5 → 20), linie 3/6/12 h/heks wg typu (0.13) | 2.6 |
| ✅ | **Model zapotrzebowania i wzrost miast wg dokumentu 05** (0.14; uchyla formułę tymczasową z 0.13): miasto = gospodarstwa + firmy; wzrost 0–4%/mies. przy `U > 99%`, wysycanie pojemnością 16×, kurczenie o połowę niedoboru przy `U < 90%`, podłoga 100/10; miasta niepodłączone zamrożone | 2.7, 5.6, doc 05 |
| ✅ | **Blok elektrowni z czterech rozmiarów (0.24)**: MAŁY / ŚREDNI / DUŻY / WIELKI wg tabeli §5.1, nic pomiędzy (uchyla dobór mocy bloku co do MW); rozmiar względny wobec technologii, rozbudowa bierze z tej samej drabiny i nie musi trafiać w bloki już stojące. Farm OZE i magazynów zmiana nie dotyczy | 5.1, 7, 8 pkt 6 |
| ✅ | Rozbudowa istniejących obiektów z twardymi limitami; obiekt zawsze zajmuje 1 heks (0.13) | 7 |
| ✅ | **Rozbudowa linii do wyższego typu (0.17)**: NN→SN→WN na tej samej trasie, 85% CAPEX-u / 70% czasu, tylko w górę i tylko dla linii gotowej; linia przesyła na starym typie do końca robót i zajmuje korytarz dla obu typów. Kara 5% za ścieżkę „tanio teraz, grubo później" przyjęta świadomie — strojenie w doc 04 | 4.2, 7 |
| ✅ | Handoff UI = wskazówka wyłącznie wizualna; wymagania z dokumentów | 8 |
| ✅ | Algorytm rozpływu: **min-cost flow** w przybliżeniu kolejnych najtańszych ścieżek; priorytet **miasta → magazyny → eksport**; niedobór emergentnie u najdalszych (0.16) | 4.4, 4.5, doc 02 |
| ✅ | **Kara bilansowa za nadwyżkę 400 zł/MWh** (0.16, rozszerzona w 0.23 na OZE): podstawą jest suma niewykorzystanej produkcji **wszystkich** źródeł; paliwo od wykorzystania, import take-or-pay | 4.1, 02 §5 |
| ✅ | **Mapa v1 ręczna 24×16, 8–12 miast** (0.16); generator proceduralny — doc 07; parametry uzupełniające (teren, magazyny, koszty stałe, rozbudowa, limity OZE) — 02 §8 | 02 §8 |
| ✅ | Prototyp: pogoda etapami — krok 1 bez reżimów, krok 2 reżimy z 06 §8 | 12 |
| ✅ | Import i eksport dostępne od startu | 5.7 |
| ✅ | Bez auto-nastaw — wszystkie nastawy ręczne | 8 |
| ✅ | Panel heksa (0.12): klik na dowolny heks = informacje + katalog budowy (jedyna droga budowania) + akcje obiektu; panel dyspozytora stale widoczny, bez zakładki budowy | 8 |
| ✅ | **Wstęga czasu (0.18)**: oś tur i wykres pokrycia zlane w jeden pas przewijany lewo-prawo, jednostką tura 3 h; wstecz bez ograniczeń, w przód do horyzontu prognozy. **Za nami sama prawda, przed nami plan przy obecnych nastawach rysowany szrafurą** (0.20; uchyla pasmo prognozy sprzed rozstrzygnięcia z 0.18) | 8 pkt 2, 2.5 |
| ✅ | **Raport opisuje turę wybraną (0.18)**, domyślnie ostatnio rozstrzygniętą; dla tury przyszłej pasek pokazuje kartę prognozy. Każdy ruch czasu sprowadza wybór na teraz | 2.3, 8 pkt 5 |
| ✅ | **Archiwum tur w stanie gry (0.18)**: trwały skrót każdej rozstrzygniętej tury (wynik, pokrycie warstwami, zakład z prognozą, miasta w niedoborze), bez limitu; pełny raport tylko dla tury ostatniej — **mapa nigdy nie cofa się ze wstęgą** | 8 pkt 1–2, 02 §4 |
| ✅ | Brak twardego stanu przegranej — porażka zawsze miękka | 9 |
| ✅ | **Kampania nieskończona**, bez wariantów długości | 2.7 |

### Zawieszone (odłożone, nie cofnięte)

| Decyzja | Status |
|---|---|
| Model elektryczny: DC power flow (z częstotliwością i rezerwami) | wraca jako poziom „Standard" — 90 §1 |
| Topologia stacyjna (przyłącze w promieniu 1 heksa, linie tylko między stacjami) | uchylona w 0.11 na rzecz topologii bezpośredniej — 90 §4 |
| Typy linii wg poziomów napięć | **przywrócone w 0.13** jako NN/SN/WN (§4.2); w 90 §4 zostają transformacja i układy rozdzielni |

### Otwarte

1. **Platforma i silnik docelowy** — nie blokuje prototypu (prototyp jest kodem
   jednorazowym); decyzja planowana wkrótce.
2. **Skutki cięcia cen z 0.25 — do doc 03.** Cięcie było jednolite, więc równowaga
   technologii jest nietknięta; otwarte zostaje **tempo**: (a) czy **taryfa 650 zł/MWh
   i kapitał startowy 10 mld** nie są teraz zbyt hojne, skoro cały majątek potaniał
   dwukrotnie, a zwroty spadły do 1,3–2,9 roku — pytanie „czy 10 mld domyka otwarcie"
   z 02 §11 zmienia się w „czy 10 mld nie domyka za dużo"; (b) czy **jądrówka mieszcząca
   się w kapitale startowym** jest wystarczająco hamowana przez koszt stały, brak odbioru
   i wyprowadzenie mocy, czy trzeba jej osobnej bariery.

*(Pytanie o docelowy mechanizm wzrostu miast rozstrzygnięte w 0.14 — dokument 05 §6.)*

---

## 12. Dokumenty i kolejne kroki

| # | Dokument | Zakres | Status |
|---|---|---|---|
| 02 | [Model symulacji uproszczonej](02-model-symulacji.md) | graf sieci (stacje/linie), rozpływ **min-cost flow** (§4.4), straty, niedobory, integracja pogody i prognoz z 06, krok tury | ✅ napisany |
| 03 | **Model ekonomiczny v1** | strojenie taryfy, kosztów, kar; test „czy 10 mld domyka otwarcie" | do napisania |
| 04 | **Katalog obiektów v1** | ostateczne liczby: elektrownie, OZE, linie, stacje, magazyny, przyłącza graniczne | do napisania |
| 05 | [Model zapotrzebowania](05-model-zapotrzebowania.md) | profile godzinowe, sezonowość, czynnik pogodowy, wzrost i przyłączanie miast | ✅ napisany |
| 06 | [Model astronomiczny i pogodowy](06-model-astronomiczny-i-pogodowy.md) | pogoda, produkcja OZE, model błędu prognozy — **obowiązuje w wersji uproszczonej** | ✅ napisany |
| 07 | **Model mapy i generator** | struktura danych heksa (w tym potencjał wiatru/nasłonecznienie), generacja proceduralna, trasowanie linii | do napisania |
| 08 | **Projekt interfejsu** | przełożenie handoffu wizualnego na zakres funkcjonalny §8; **wstęga czasu (0.18) nie ma odpowiednika w handoffie** — przewijanie, separatory dób i karta prognozy na pasku raportu wymagają projektu | handoff wizualny istnieje |
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
