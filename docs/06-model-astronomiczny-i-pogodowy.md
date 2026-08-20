# ElectroNation — Model astronomiczny, klimatyczny i pogodowy

**Wersja:** 0.8
**Data:** 2026-08-20
**Status:** **obowiązujący** — źródłowy model pogody, produkcji OZE (PV, wiatr) i błędu
prognozy dla uproszczonej wersji gry (01 v0.8, §2.4 i §5.2). Uproszczenie dotyczy silnika
przepływu energii w sieci (01 §4) i nie zmienia niczego w tym modelu. Elementy „na przyszłość"
wymienione w §10 pozostają odłożone ([90-pomysly-na-przyszlosc.md §2](90-pomysly-na-przyszlosc.md)).

**Zmiany 0.7 → 0.8 (klasa morska wychodzi z parkingu):** model bez zmian — klasa
**Morze — Bałtyk** z §6.1 była w nim od 0.4, a od 0.22 dokumentu 01 obsługuje realną
technologię (farma wiatrowa na heksie morskim). Dochodzi **test §12.14**: CF klasy morskiej
liczony warunkowo na reżim §8.2, który pilnuje, że morze **nie rozbraja Dunkelflaute**
(CF ≤1%) i **gaśnie w sztormie przed lądem**. To jedyna zmiana; λ, k i sezonowość
zostają nietknięte.

**Zmiany 0.6 → 0.7 (horyzont kroczący):** §8.6.3 rozstrzyga, że horyzont systemu prognostycznego
liczy się **od tury bieżącej**, a nie do końca bieżącej doby (01 v0.18 §2.4) — z formalną granicą
zasięgu i jej konsekwencją dla generacji prawdy dób następnych. Model błędu (§8.6.2), architektura
(§8.6.1) i prezentacja (§8.6.4) bez zmian.

**Zmiany 0.5 → 0.6 (domknięcie testu §12.12):** test 12 dostaje **definicję epizodu
Dunkelflaute w kalendarzu gry** (doba wyżu zimowego z produkcją referencyjnego portfela
OZE poniżej 10% mocy zainstalowanej; epizod = ciąg kolejnych takich dób, także przez
granicę miesiąca) i **pasma przeliczone na doby gry**. Dotychczasowe „2–5 epizodów ≥3 doby
w roku" było statystyką kalendarza rzeczywistego i nie miało odpowiednika w modelu 3 dób
na miesiąc — szczegóły i pomiar w §12.12. Reszta modelu bez zmian.

**Zmiany 0.4 → 0.5 (weryfikacja pomiarowa na pełnym torze §8):** §6.1 rozstrzyga wreszcie
konflikt λ vs CF — kolumna CF w 0.4 była **wartością analityczną** (całka Weibulla), a pełny
tor generacji podnosi ją o ~2,5–3 pp; tabela dostaje osobne kolumny „λ silnika" i „CF w
silniku", a kontraktem implementacji stają się pasma §12, nie punktowe CF. Praktyczny skutek:
λ wybrzeża w silniku to 7,65, bo przy deklarowanym 8,0 CF wychodzi 32,5% i wypada z pasma
§12.7. Dodana **czwarta klasa lokalizacji — teren osłoniony** (k=2,0, λ=5,8; CF ~15%) wraz
z testem §12.13: bez niej wybór miejsca pod farmę wiatrową nie był decyzją (teren otwarty
26,9% vs wybrzeże 29,7% to różnica bez znaczenia dla gracza).

**Zmiany 0.3 → 0.4 (kalibracja przy implementacji silnika):** parametry λ Weibulla w §6.1
skorygowane (7,3 / 8,0 / 10,2 zamiast 6,6 / 7,7 / 10,2) — pierwotne wartości nie spełniały
własnych testów akceptacyjnych §12.7–8 (λ=6,6 daje CF ~19%, a nie deklarowane ~24%).
Nowe λ dają CF: ląd otwarty ~24,6%, wybrzeże ~29,6%, Bałtyk ~45,5% — w pasmach §12.
Tabela §6.4 (sezonowość miesięczna) jest **kształtem** — w implementacji normalizuje się ją
do własnej średniej rocznej i skaluje na λ klasy lokalizacji.

**Zmiany 0.2 → 0.3:** poziomy systemów prognostycznych wydłużają też **horyzont prognozy** — bazowo bieżąca doba (24 h), zaawansowany 3 doby, ansamblowy 7 dób; σ rośnie dalej z każdą kolejną dobą (§8.6.3; decyzja 01 v0.13).
**Zmiany 0.1 → 0.2:** dodano **§8.6 — model prognozy i jej błędu** w związku z przejściem na rozgrywkę turową (dok. 01 §2.2–2.5). Kluczowa konsekwencja architektoniczna: prawdziwy przebieg pogody musi być generowany **w całości przy inicjalizacji doby**, a prognoza jest jego zaszumionym widokiem — nie odwrotnie.
**Dokument nadrzędny:** [01-mechanika-gry.md](01-mechanika-gry.md)
**Zakres:** długość dnia, wysokość słońca, nasłonecznienie, wiatr, temperatura, zachmurzenie — jako wejście do modeli produkcji PV i farm wiatrowych oraz do modelu zapotrzebowania.

---

## 1. Cel i zakres

Ten dokument definiuje **deterministyczną warstwę astronomiczną** (obliczaną ze wzorów, identyczną w każdej rozgrywce dla danej daty i szerokości geograficznej) oraz **stochastyczną warstwę pogodową** (losowaną, ale skorelowaną między parametrami).

```
┌──────────────────────────────────────────────────────────┐
│  WARSTWA ASTRONOMICZNA (deterministyczna)                │
│  szerokość geogr. + dzień roku + godzina                 │
│      → deklinacja słońca                                 │
│      → wysokość słońca α                                 │
│      → wschód / zachód / długość dnia                    │
│      → irradiancja przy niebie bezchmurnym GHI_clear     │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  WARSTWA POGODOWA (stochastyczna, skorelowana)           │
│  reżim pogodowy → zachmurzenie C, wiatr v, temperatura T │
└────────────────────────┬─────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
  PRODUKCJA PV     PRODUKCJA WIATRU   ZAPOTRZEBOWANIE
  GHI_clear × C     krzywa mocy(v)    f(T, długość dnia)
       │                 │                 │
       └─────────────────┴─────────────────┘
                         ▼
                 BILANS SYSTEMU
```

Kluczowa właściwość, którą model musi zapewnić: **parametry pogodowe są ze sobą skorelowane**. Niezależne losowanie zachmurzenia, wiatru i temperatury dałoby pogodę fizycznie niemożliwą i — co gorsze dla rozgrywki — pozbawioną dramaturgii. Rozwiązanie w sekcji 8.

---

## 2. Parametry geograficzne — Polska jako konfiguracja startowa

| Parametr | Wartość | Uwagi |
|---|---|---|
| **Szerokość geograficzna φ** | **52,0° N** | wartość pojedyncza (centrum kraju, ok. Warszawy) |
| Zakres rzeczywisty kraju | 49,0° – 54,8° N | *na przyszłość* — patrz sekcja 10 |
| Długość geograficzna | 19,5° E | potrzebna tylko do czasu słonecznego |
| Strefa czasowa | UTC+1 (zima) / UTC+2 (lato) | **propozycja: pomijamy czas letni** |
| Strefa klimatyczna | umiarkowana przejściowa (Dfb) | między morską a kontynentalną |
| Średnia roczna temperatura | 9,0 °C | |
| Średnie roczne zachmurzenie | 0,64 | udział nieba pokrytego chmurami |
| Średnia prędkość wiatru @100 m | 6,8 m/s | ląd, teren otwarty |

**Decyzja projektowa:** przyjmujemy **jedną szerokość geograficzną dla całego kraju**. Różnica długości dnia między południem a północą Polski wynosi ~70 minut w przesileniu letnim — istotna geograficznie, ale pomijalna dla rozgrywki. Model wieloszerokościowy wchodzi dopiero przy dużych krajach (sekcja 10).

**Decyzja projektowa:** pomijamy zmianę czasu na letni. Wprowadza sztuczne przesunięcie profilu zapotrzebowania i myli gracza, nie wnosząc nic do mechaniki.

---

## 3. Model astronomiczny

Wejście: `n` — dzień roku (1–365), `h` — godzina słoneczna (0–24), `φ` — szerokość geograficzna.

### 3.1 Deklinacja słoneczna δ

Kąt między płaszczyzną równika a kierunkiem na Słońce. Waha się od −23,45° (przesilenie zimowe) do +23,45° (letnie).

```
δ(n) = 23,45° · sin( 360° · (284 + n) / 365 )
```

*(wzór Coopera — błąd do ~0,5°, w zupełności wystarczający)*

### 3.2 Równanie czasu (opcjonalne)

Różnica między czasem słonecznym rzeczywistym a średnim, wynikająca z eliptyczności orbity. Zakres ±16 minut.

```
B    = 360° · (n − 81) / 364
EoT  = 9,87·sin(2B) − 7,53·cos(B) − 1,5·sin(B)      [minuty]
```

**Rekomendacja: pominąć w wersji podstawowej.** Przy turach 3-godzinnych (dok. 01 §2.2) przesunięcie o kilkanaście minut jest niewidoczne. Zostawić jako flagę do włączenia.

### 3.3 Kąt godzinowy ω

```
ω(h) = 15° · (h − 12)
```

Południe słoneczne = 0°, każda godzina to 15°. Rano ujemny, po południu dodatni.

### 3.4 Wysokość słońca α

**To jest najważniejsza wielkość w całym dokumencie** — od niej zależy produkcja PV.

```
sin(α) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(ω)
```

Gdy `sin(α) ≤ 0` — słońce pod horyzontem, produkcja PV = 0.

Maksymalna wysokość słońca w danym dniu (w południe):

```
α_max(n) = 90° − φ + δ(n)
```

### 3.5 Azymut słońca (opcjonalny)

Potrzebny tylko przy panelach nadążnych (trackerach) i przy panelach o orientacji innej niż południowa:

```
cos(A) = ( sin(δ)·cos(φ) − cos(δ)·sin(φ)·cos(ω) ) / cos(α)
```

**Rekomendacja: pominąć w wersji podstawowej**, przyjąć wszystkie panele jako stałe, skierowane na południe, o nachyleniu ≈ φ − 10°.

### 3.6 Wschód, zachód i długość dnia

Kąt godzinowy wschodu/zachodu, z poprawką na refrakcję atmosferyczną (−0,833° — moment, w którym górna krawędź tarczy dotyka horyzontu):

```
cos(ω_s) = ( sin(−0,833°) − sin(φ)·sin(δ) ) / ( cos(φ)·cos(δ) )

długość_dnia = 2 · ω_s / 15                    [godziny]
wschód       = 12 − ω_s / 15                   [godzina słoneczna]
zachód       = 12 + ω_s / 15
```

Przypadki brzegowe (istotne przy przyszłych mapach polarnych):
- `cos(ω_s) < −1` → **dzień polarny**, słońce nie zachodzi
- `cos(ω_s) > 1` → **noc polarna**, słońce nie wschodzi

### 3.7 Tablica referencyjna dla Polski (φ = 52° N)

Wartości obliczone z powyższych wzorów — **służą do weryfikacji implementacji**. Kolumna „rzeczywiste" to dane dla Warszawy.

| Data | n | δ [°] | Długość dnia | Rzeczywiste | α_max [°] | GHI_clear w południe [W/m²] |
|---|---|---|---|---|---|---|
| 21 sty | 21 | −20,1 | 8 h 29 min | ~8 h 25 min | 17,9 | 280 |
| 21 lut | 52 | −11,2 | 10 h 14 min | ~10 h 15 min | 26,8 | 436 |
| 21 mar | 80 | −0,4 | 12 h 07 min | ~12 h 08 min | 37,6 | 610 |
| 21 kwi | 111 | +11,6 | 14 h 13 min | ~14 h 15 min | 49,6 | 776 |
| 21 maj | 141 | +20,1 | 15 h 57 min | ~15 h 55 min | 58,1 | 872 |
| **21 cze** | 172 | **+23,45** | **16 h 44 min** | ~16 h 45 min | **61,5** | **904** |
| 21 lip | 202 | +20,4 | 16 h 01 min | ~16 h 05 min | 58,4 | 875 |
| 21 sie | 233 | +11,8 | 14 h 15 min | ~14 h 05 min | 49,8 | 778 |
| 21 wrz | 264 | −0,2 | 12 h 09 min | ~12 h 10 min | 37,8 | 613 |
| 21 paź | 294 | −11,8 | 10 h 08 min | ~10 h 05 min | 26,2 | 427 |
| 21 lis | 325 | −20,4 | 8 h 25 min | ~8 h 20 min | 17,6 | 274 |
| **21 gru** | 355 | **−23,45** | **7 h 44 min** | ~7 h 42 min | **14,6** | **220** |

**Wnioski dla rozgrywki, wprost z tej tabeli:**
- Dzień grudniowy jest **2,2× krótszy** od czerwcowego (7 h 44 min vs 16 h 44 min).
- Słońce w grudniowe południe stoi na wysokości **14,6°** — czterokrotnie niżej niż w czerwcu.
- Chwilowe nasłonecznienie w grudniu to **24%** wartości czerwcowej.
- Złożenie obu efektów: **energia dzienna z PV w grudniu to ok. 8–10% energii czerwcowej.** A grudzień to miesiąc szczytowego zapotrzebowania. To fundamentalne napięcie całej gry i wynika wprost z geometrii, nie z arbitralnego balansu.

---

## 4. Model nasłonecznienia

### 4.1 Irradiancja pozaziemska

```
G_0(n) = 1361 · ( 1 + 0,033 · cos(360° · n / 365) )     [W/m²]
```

Waha się o ±3,3% wskutek eliptyczności orbity (maksimum w styczniu — paradoksalnie, gdy na półkuli północnej jest zima).

### 4.2 Masa optyczna atmosfery

Ile atmosfery pokonuje promień. Przy słońcu w zenicie AM = 1, przy niskim słońcu rośnie gwałtownie.

```
AM(α) = 1 / ( sin(α) + 0,50572 · (α + 6,07995)^(−1,6364) )       [α w stopniach]
```

*(wzór Kastena-Younga — ważny także dla α bliskiego 0, w przeciwieństwie do prostego 1/sin α)*

### 4.3 Irradiancja przy niebie bezchmurnym

```
GHI_clear(α) = 1098 · sin(α) · exp( −0,057 / sin(α) )       [W/m²]
```

*(model Haurwitza — jednoparametrowy, zaskakująco dokładny, idealny do gry)*

Dla `α ≤ 0` → `GHI_clear = 0`.

### 4.4 Tłumienie przez zachmurzenie

`C` — stopień zachmurzenia, 0 (bezchmurnie) do 1 (całkowite zachmurzenie).

```
GHI = GHI_clear · ( 1 − 0,75 · C^3,4 )
```

*(model Kastena-Czeplaka)*

| C | Mnożnik | Interpretacja |
|---|---|---|
| 0,0 | 1,00 | bezchmurnie |
| 0,3 | 0,99 | pojedyncze chmury — słońce prawie niezakłócone |
| 0,5 | 0,93 | zachmurzenie umiarkowane |
| 0,8 | 0,64 | duże zachmurzenie |
| 1,0 | **0,25** | pełne zachmurzenie — zostaje samo światło rozproszone |

Wykładnik 3,4 sprawia, że **częściowe zachmurzenie prawie nie szkodzi, a pełne ścina produkcję do jednej czwartej**. To zgodne z rzeczywistością i dobre dla rozgrywki: pochmurny dzień to nie „trochę mniej prądu", tylko załamanie produkcji. Wykładnik zostawiamy jako parametr do strojenia.

---

## 5. Produkcja PV

```
T_ogniwa = T_powietrza + (NOCT − 20) / 800 · GHI            [NOCT ≈ 45 °C]

η_temp   = 1 + γ · (T_ogniwa − 25)                          [γ ≈ −0,004 /°C]

P_PV     = P_nom · (GHI / 1000) · η_temp · η_system         [η_system ≈ 0,85]
```

**Efekt temperaturowy jest kontrintuicyjny i wart pokazania graczowi:** panele tracą ~0,4% mocy na każdy stopień powyżej 25 °C. W upalny lipcowy dzień ogniwa osiągają ~60 °C, co oznacza stratę ok. 14%. Chłodny, słoneczny kwiecień bywa dla PV wydajniejszy niż upalny lipiec.

**Kontrola poprawności:** roczny współczynnik wykorzystania mocy (CF) dla PV w Polsce powinien wyjść **11–12%**. Jeśli symulacja daje istotnie inną wartość, model wymaga korekty.

---

## 6. Model wiatru

### 6.1 Rozkład prędkości — Weibull

Prędkość wiatru w danej lokalizacji opisuje rozkład Weibulla o parametrach `k` (kształt) i `λ` (skala):

```
f(v) = (k/λ) · (v/λ)^(k−1) · exp( −(v/λ)^k )

v_średnie = λ · Γ(1 + 1/k)
```

| Lokalizacja | k | λ [m/s] @100 m | λ silnika | v_śr [m/s] | CF analityczny | CF w silniku |
|---|---|---|---|---|---|---|
| Ląd — teren osłonięty (kotliny, doliny górskie) | 2,0 | 5,8 | 5,8 | 5,1 | ~13,8% | ~15,3% |
| Ląd — teren otwarty (centrum PL) | 2,0 | 7,3 | 7,3 | 6,5 | ~24,6% | ~26,9% |
| Ląd — wybrzeże / Suwalszczyzna | 2,1 | 8,0 | **7,65** | 7,1 | ~29,6% | ~29,7% |
| Morze — Bałtyk | 2,2 | 10,2 | 10,2 | 9,0 | ~45,5% | ~48,5% |

**Dwie kolumny CF — dlaczego.** „CF analityczny" to całka rozkładu Weibulla po krzywej mocy
§6.3, z sezonowością §6.4 jako kształtem znormalizowanym; tak policzone są wartości z kolumny
λ. Pełny tor generacji §8 (szum OU, reżimy, współczynnik dobowy) nakłada na prędkość szum
multiplikatywny, a że krzywa mocy poniżej mocy znamionowej jest **wypukła**, średnia produkcja
rośnie — o **~2,5–3 pp** względem całki. „CF w silniku" to wartość zmierzona na 100 latach
symulacji pełnego toru.

**DECYZJA (0.5): kontraktem implementacji są pasma §12.7–12.8 i §12.13, a nie punktowe CF
z tabeli.** λ silnika = λ pomiarowe wszędzie tam, gdzie CF pełnego toru mieści się w paśmie;
przycinane tylko tam, gdzie z pasma wypada. Dotyczy to jednej klasy: wybrzeże przy λ = 8,0
daje 32,5%, czyli powyżej pasma 24–30% z §12.7 — stąd λ silnika 7,65 (CF 29,7%).

**Klasa osłonięta (0.5)** obejmuje kotliny i doliny górskie, gdzie na 100 m wieje ~5 m/s.
W grze jest po to, żeby lokalizacja farmy była decyzją: rozpiętość produkcji między najgorszym
a najlepszym lądowym miejscem to ~15% vs ~30% CF, czyli **dwukrotność**, a nie kosmetyczne
3 pp między terenem otwartym a wybrzeżem. Przypisanie klas do heksów należy do danych mapy
(02 §8.6).

*(0.4, kontekst historyczny: λ podniesiono z 6,6 / 7,7 / 10,2, bo krzywa mocy §6.3 przy
pierwotnych wartościach dawała CF ~19% dla terenu otwartego; sezonowość §6.4 wchodzi jako
kształt znormalizowany.)*

### 6.2 Profil pionowy — dlaczego wysokość wieży ma znaczenie

```
v(h) = v_ref · ( h / h_ref )^a
```

| Teren | Wykładnik a |
|---|---|
| Morze / duże jezioro | 0,10 |
| Teren otwarty, pola | 0,14 |
| Teren z zabudową rozproszoną | 0,20 |
| Las, teren zurbanizowany | 0,25 |

Konsekwencja dla gracza: podniesienie wieży ze 100 m na 150 m nad terenem otwartym daje ~6% wzrostu prędkości, a ponieważ moc rośnie z sześcianem prędkości — **~19% więcej energii**. Wyższa wieża kosztuje, ale zwraca się. Nad lasem efekt jest jeszcze silniejszy.

### 6.3 Krzywa mocy turbiny

```
v < v_in                 →  P = 0
v_in ≤ v < v_rated       →  P = P_nom · (v³ − v_in³) / (v_rated³ − v_in³)
v_rated ≤ v < v_out      →  P = P_nom
v ≥ v_out                →  P = 0        ← WYŁĄCZENIE SZTORMOWE
```

Typowe wartości: `v_in` = 3 m/s, `v_rated` = 12 m/s, `v_out` = 25 m/s.

**Trzy właściwości, które trzeba wyeksponować w rozgrywce:**

1. **Zależność sześcienna.** Podwojenie prędkości wiatru to ośmiokrotny wzrost mocy. Wiatr 6 m/s daje ~12% mocy znamionowej, wiatr 9 m/s — ~42%. Prognoza wiatru z błędem 1 m/s przekłada się na ogromny błąd prognozy mocy.
2. **Wyłączenie sztormowe.** Przy 25 m/s turbiny stają — **najsilniejszy wiatr oznacza zerową produkcję**. Gorzej: podczas przechodzenia frontu sztormowego przez kraj farmy wyłączają się kaskadowo w ciągu kilku godzin. Utrata kilku GW w krótkim czasie to jedno z najtrudniejszych zdarzeń w grze.
3. **Plateau.** Między 12 a 25 m/s produkcja jest stała — nadmiar wiatru nie daje nic.

*(Nowoczesne turbiny stosują łagodne ograniczanie mocy zamiast twardego odcięcia; wariant do rozważenia jako ulepszenie technologiczne w późnej grze, zmniejszające dotkliwość sztormów.)*

### 6.4 Sezonowość wiatru w Polsce

Średnia miesięczna prędkość wiatru na 100 m, teren otwarty:

| Mies. | I | II | III | IV | V | VI | VII | VIII | IX | X | XI | XII |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v [m/s] | 8,0 | 7,8 | 7,3 | 6,6 | 6,0 | 5,7 | 5,6 | 5,6 | 6,2 | 7,0 | 7,7 | 8,0 |

**To najważniejsza korelacja w całej grze:** wiatr wieje najmocniej zimą, czyli dokładnie wtedy, gdy PV produkuje najmniej, a zapotrzebowanie jest najwyższe. Wiatr i słońce **wzajemnie się uzupełniają sezonowo** — i na tym opiera się sensowność miksu OZE.

Ale to uzupełnianie jest tylko *statystyczne*. Zimowy wyż baryczny znosi je jednocześnie: brak wiatru **i** brak słońca przy maksymalnym zapotrzebowaniu. To jest *Dunkelflaute* i to jest właściwy test dla gracza.

---

## 7. Model temperatury

### 7.1 Przebieg roczny

```
T_dobowa_śr(n) = T_roczna_śr + A_roczna · cos( 2π · (n − 202) / 365 )
```

Dla Polski: `T_roczna_śr = 9,0 °C`, `A_roczna = 10,5 °C`, maksimum ok. 21 lipca (n = 202).

| Mies. | I | II | III | IV | V | VI | VII | VIII | IX | X | XI | XII |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T śr. [°C] | −1,5 | −0,5 | 3,2 | 9,0 | 14,3 | 17,5 | 19,8 | 19,2 | 14,2 | 9,0 | 3,9 | 0,2 |

### 7.2 Przebieg dobowy

```
T(n, h) = T_dobowa_śr(n) − (A_dobowa(n) / 2) · cos( 2π · (h − 14,5) / 24 )
```

Minimum ok. 5:00 (tuż przed wschodem), maksimum ok. 14:30. Amplituda dobowa zależy od pory roku i zachmurzenia:

```
A_dobowa = A_bazowa(n) · (1 − 0,6 · C)
```

`A_bazowa`: ~10 °C latem, ~4 °C zimą. Zachmurzenie spłaszcza dobowy przebieg (chmury działają jak koc — noc cieplejsza, dzień chłodniejszy).

### 7.3 Zastosowania temperatury

| Gdzie | Efekt |
|---|---|
| **Zapotrzebowanie** | poniżej ~15 °C rośnie (ogrzewanie), powyżej ~22 °C rośnie (klimatyzacja) — krzywa „V" |
| **Sprawność PV** | −0,4% mocy na każdy °C powyżej 25 °C |
| **Obciążalność linii** | upał obniża dopuszczalną obciążalność przewodów o 10–20% |
| **Sprawność bloków cieplnych** | wyższa temperatura chłodzenia = niższa sprawność |
| **Chłodzenie elektrowni** | upał + susza = ograniczenie mocy lub postój |
| **Awarie** | mróz: zamarzanie instalacji paliwowych; oblodzenie: zerwane przewody, oblodzone turbiny |

---

## 8. Generator pogody — reżimy pogodowe

### 8.1 Dlaczego nie wolno losować parametrów niezależnie

Gdyby zachmurzenie, wiatr i temperatura były losowane osobno, powstałaby pogoda niemożliwa fizycznie (mroźno, bezchmurnie i wietrznie jednocześnie) i — co ważniejsze — **pozbawiona charakteru**. Nie byłoby zimowego wyżu, nie byłoby sztormu, nie byłoby Dunkelflaute. Zniknęłyby wszystkie sytuacje, które czynią grę interesującą.

**Rozwiązanie: reżimy pogodowe.** Stan pogody to jeden z kilku typów sytuacji synoptycznej, a każdy z nich narzuca skorelowany zestaw parametrów.

### 8.2 Katalog reżimów (klimat Polski)

| Reżim | Zachmurzenie C | Wiatr (mnożnik) | Temperatura (odchyłka) | Produkcja PV | Produkcja wiatru |
|---|---|---|---|---|---|
| **Wyż zimowy — mroźny** | 0,1–0,3 | ×0,25 | −8…−15 °C | mała (dzień krótki) | **~zero** |
| **Wyż zimowy — z mgłą/stratusem** | 0,9–1,0 | ×0,20 | −2…−6 °C | **~zero** | **~zero** |
| **Niż atlantycki** | 0,8–1,0 | ×1,4 | +3…+8 °C | mała | **wysoka** |
| **Sztorm / głęboki niż** | 0,9–1,0 | ×2,2 | +2…+6 °C | ~zero | **skokowa → zero** (wyłączenia) |
| **Wyż letni — upał** | 0,0–0,2 | ×0,5 | +5…+12 °C | **maksymalna** | mała |
| **Niż letni** | 0,7–0,9 | ×1,2 | −2…−5 °C | mała | umiarkowana |
| **Pogoda przejściowa** | 0,4–0,7 | ×1,0 | 0 °C | umiarkowana | umiarkowana |
| **Fala mrozów (kontynentalna)** | 0,2–0,5 | ×0,4 | −12…−22 °C | mała | mała |

Dwa reżimy oznaczone pogrubieniem w kolumnach produkcji to serce rozgrywki:

- **Wyż zimowy** (obie odmiany) = **Dunkelflaute**. Zero wiatru, PV śladowe (dzień 8 h, słońce 15°), zapotrzebowanie na maksimum wskutek mrozu. Trwa 3–10 dni. To jest test, dla którego istnieją magazyny, elektrownie szczytowe i połączenia transgraniczne. I to jest moment, w którym **sąsiedzi też mają kryzys** — bo ten sam wyż stoi nad połową Europy.
- **Sztorm** = nadprodukcja przechodząca w nagły zanik. Najpierw ceny lecą na łeb (za dużo wiatru, trzeba go komuś oddać), potem front dociera do farm i kilka GW znika w ciągu godzin.

### 8.3 Przejścia między reżimami — łańcuch Markowa

Reżim ma **bezwładność** — pogoda utrzymuje się przez kilka dni. Modelujemy to łańcuchem Markowa z macierzą przejść zależną od miesiąca:

```
P(reżim_jutro | reżim_dziś, miesiąc)
```

Zasady konstrukcji macierzy:
- Wysokie prawdopodobieństwo pozostania w tym samym reżimie (0,6–0,8) → typowy czas trwania 3–6 dni.
- Reżimy zimowe mają zerowe prawdopodobieństwo w miesiącach letnich i odwrotnie.
- Sztorm jest krótki (0,3 pozostania) i wychodzi się z niego zwykle do niżu atlantyckiego.
- Zimowy wyż jest **trwały** (0,80) — dlatego Dunkelflaute potrafi się ciągnąć.

Rozkłady startowe reżimów per miesiąc (przykład dla stycznia i lipca):

| Reżim | Styczeń | Lipiec |
|---|---|---|
| Wyż zimowy (mroźny + mglisty) | 30% | 0% |
| Niż atlantycki | 40% | 10% |
| Sztorm | 8% | 2% |
| Wyż letni | 0% | 35% |
| Niż letni | 0% | 28% |
| Przejściowa | 17% | 25% |
| Fala mrozów | 5% | 0% |

### 8.4 Powiązanie z modelem 3 dób na miesiąc

Zgodnie z sekcją 2.1 dokumentu 01, gramy 3 doby miesięcznie (2 robocze + 1 wolna), a zjawiska wielodniowe muszą być losowane na poziomie miesiąca. Konkretnie:

1. Na początku miesiąca losowany jest **reżim dominujący** z rozkładu miesięcznego.
2. Reżim dominujący obejmuje **wszystkie 3 doby miesiąca** — dzięki temu Dunkelflaute jest przeżywana jako narastający kryzys (magazyny pustoszeją doba po dobie), a nie jako pojedynczy zły dzień.
3. Wewnątrz reżimu każda doba dostaje **własne wylosowanie** parametrów z rozkładów tego reżimu, więc doby nie są identyczne.
4. Z małym prawdopodobieństwem (~15%) miesiąc może mieć **zmianę reżimu** — np. doby 1–2 w niżu, doba 3 w sztormie. To daje zmienność i zapobiega monotonii.
5. Reżim jest **znany graczowi z wyprzedzeniem** jako prognoza miesięczna, ale z błędem malejącym wraz z inwestycjami w systemy prognostyczne.

### 8.5 Zmienność wewnątrzdobowa

W obrębie doby parametry nie mogą być stałe. Model:

```
v(t) = v_bazowe_doby · ( 1 + szum_skorelowany(t) )
```

Gdzie `szum_skorelowany` to proces o pamięci (np. Ornsteina-Uhlenbecka albo szum Perlina) — wiatr zmienia się płynnie, nie skokowo. Amplituda ±20–30%, czas korelacji ~2–3 godziny.

**To jest źródło pracy dyspozytora.** Gdyby wiatr był stały przez dobę, gracz ustawiłby jednostki raz i poszedł na kawę. Płynne wahania wiatru wymuszają ciągłą korektę bilansu — i to właśnie jest główna mechanika gry.

Zachmurzenie modelujemy analogicznie (przechodzące chmury = wahania produkcji PV), z krótszym czasem korelacji (~30–60 min).

---

## 8.6 Prognoza i jej błąd — model dla rozgrywki turowej

Od wersji 0.4 dokumentu 01 gra jest turowa i **gracz nie widzi stanu bieżącego pogody — widzi prognozę**. To wymaga rozdzielenia dwóch warstw danych.

### 8.6.1 Architektura: prawda generowana z góry, prognoza jako jej zaszumiony widok

```
init doby
   │
   ├─► GENERACJA PRAWDY: pełny 24-godzinny przebieg wiatru,
   │   zachmurzenia i temperatury (reżim + proces OU)
   │   → zapisany w całości, niezmienny do końca doby
   │
   └─► PROGNOZA(godzina docelowa, godzina bieżąca):
       prawda + błąd(horyzont)
```

**To jest wymóg poprawności, nie wygody.** Gdyby prawda była losowana dopiero w chwili rozstrzygnięcia tury, prognoza pokazana wcześniej nie miałaby z nią żadnego związku — gracz nie mógłby się uczyć, bo nie istniałaby wielkość, którą prognoza próbuje trafić. Prawda musi istnieć **zanim** gracz zobaczy pierwszą prognozę.

Efekt uboczny jest cenny: doba staje się w pełni **odtwarzalna** przy zadanym ziarnie losowym, co pozwala porównywać strategie na identycznej pogodzie.

### 8.6.2 Model błędu

Błąd wyrażamy jako **udział mocy zainstalowanej** (standard branżowy dla prognoz OZE) i jako udział szczytu dla zapotrzebowania:

```
σ_wiatr(h) = 0,040 + 0,022·h        [h — horyzont w godzinach]
σ_PV(h)    = 0,030 + 0,020·h
σ_popyt(h) = 0,010 + 0,004·h
```

| Horyzont | Wiatr | PV | Zapotrzebowanie |
|---|---|---|---|
| +1 h | ±6,2% | ±5,0% | ±1,4% |
| +3 h | ±10,6% | ±9,0% | ±2,2% |
| +6 h | ±17,2% | ±15,0% | ±3,4% |
| +12 h | ±30,4% | ±27,0% | ±5,8% |

Dla farmy 900 MW oznacza to ±56 MW przy +1 h i ±155 MW przy +6 h.

**Trzy własności, które z tego wynikają:**

1. **Zapotrzebowanie jest niemal pewne, pogoda nie.** Gracz może ufać prognozie popytu i musi zabezpieczać się przed prognozą wiatru — zgodnie z rzeczywistością.
2. **Prognoza godzinowa jest dokładna; trudne są decyzje wielogodzinne.** Przy +1 h gracz trafia prawie zawsze. Prawdziwy dylemat brzmi: *czy uruchomić blok gazowy teraz na szczyt oddalony o cztery godziny, skoro pasmo prognozy wiatru na tę godzinę wynosi ±120 MW?* To jest **unit commitment** i to jest właściwa gra.
3. **Błąd musi być skorelowany w czasie, nie losowany niezależnie dla każdej godziny.** Prognoza mylnie zaniżająca wiatr o 15:00 zaniża go zwykle także o 16:00. Modelujemy to jednym procesem błędu na dobę, skalowanym horyzontem — inaczej pasma wyglądałyby jak szum i gracz nauczyłby się je ignorować.

### 8.6.3 Zwężanie pasma jako inwestycja

Dokładność prognozy jest **kupowalna**: mezoskalowy model pogody, telemetria farm, prognoza ansamblowa. Każdy poziom mnoży współczynniki `σ` przez wartość poniżej 1 **i wydłuża horyzont prognozy** (0.3; dok. 01 §2.4):

| Poziom | Mnożnik σ | Horyzont `D` | Efekt |
|---|---|---|---|
| Brak (persystencja) | ×1,6 | — | prognoza = stan bieżący (punkt odniesienia, poza grą) |
| Podstawowy | ×1,0 | 1 doba (24 h) | wartości z tabeli |
| Zaawansowany | ×0,7 | 3 doby (72 h) | |
| Ansamblowy | ×0,5 | 7 dób (168 h, maksimum) | |

**DECYZJA (0.7, za 01 v0.18 §2.4): horyzont jest kroczący.** Liczy się od tury bieżącej, nie do końca bieżącej doby. Godzina docelowa jest w zasięgu prognozy dokładnie wtedy, gdy

```
1 ≤ h ≤ 24·D,     h = 24·Δdoba + godzina − tura_bieżąca·3 + 1
```

gdzie `Δdoba` to odstęp doby docelowej od bieżącej, `godzina` ∈ 0..23 liczy się wewnątrz doby docelowej, a `D` to horyzont poziomu w dobach. `h ≤ 0` oznacza godzinę już ujawnioną — prawda, pasmo 0 (§8.6.1).

W jednostce rozgrywki granica jest równa: prognoza obejmuje **dokładnie `8·D` tur** — bieżącą i `8·D − 1` następnych — niezależnie od pory doby (8 / 24 / 56 tur). W turze 1 zasięg pokrywa się z bieżącą dobą; w każdej kolejnej okno przesuwa się o 3 h w przód, zaglądając odpowiednio głębiej w dobę następną (w turze 8 poziomu podstawowego: 21 h doby następnej).

Konsekwencja implementacyjna: **prawda musi być dostępna dla `Δdoba ≤ D`, a nie `< D`** — poziom podstawowy zagląda do doby następnej we wszystkich turach poza pierwszą. Prognozy dób przyszłych wymagają wygenerowania ich prawdy z wyprzedzeniem; architektonicznie prawda może powstawać dla całego horyzontu przy inicjalizacji albo na żądanie, doba po dobie z tego samego ziarna (§8.6.1 stosuje się bez zmian — ta sama doba wygenerowana raz i wygenerowana ponownie musi być identyczna co do bitu).

Poza pierwszą dobą σ **rośnie dalej z horyzontem** — każda kolejna doba prognozy ma szersze pasmo (ograniczenie `min(h, 12)` z §8.6.2 dotyczy przebiegu wewnątrz doby; przyrost międzydobowy, np. +20–30% σ na dobę, do strojenia przy implementacji prognozy wielodobowej). Przyrost międzydobowy jest kluczowany **odstępem doby kalendarzowej** (`Δdoba`), nie ciągłym horyzontem `h`: pasmo rośnie skokiem na granicy doby, a nie po 24 h od tury bieżącej. Świadome uproszczenie — trzyma rachunek σ deterministycznym i niezależnym od tego, w której turze gracz patrzy.

To rzadki przypadek inwestycji, która **nie dodaje ani jednego megawata mocy, a mimo to realnie obniża koszty** — bo pozwala trzymać mniejszą rezerwę. Dobry sposób, by pokazać graczowi, ile warta jest informacja.

### 8.6.4 Prezentacja

Prognoza powinna być podana jako **pasmo, nie liczba**. Gracz ma widzieć zakres, nie punkt — inaczej potraktuje ją jako pewnik i nie nauczy się trzymać rezerwy.

Najważniejszy element interfejsu to kolumna **„bilans przy obecnych nastawach"** dla kolejnych godzin: czy plan, który gracz ma teraz ustawiony, przeżyje najbliższe 6 godzin. To czyni decyzję o rozruchu bloku czytelną, zamiast zostawiać ją intuicji.

---

## 9. Wpływ na zapotrzebowanie

Warstwa astronomiczna wpływa na popyt niezależnie od temperatury:

| Czynnik | Mechanizm |
|---|---|
| **Długość dnia** | oświetlenie — grudniowy szczyt wieczorny zaczyna się o 15:30, czerwcowy o 21:00 |
| **Zachód słońca** | moment startu wieczornej rampy; zimą **zbiega się** ze szczytem powrotów z pracy → kumulacja |
| **Zachmurzenie** | pochmurny dzień = oświetlenie włączone także w dzień |
| **Temperatura** | ogrzewanie / klimatyzacja (sekcja 7.3) |

**Kluczowe zjawisko do odwzorowania:** w grudniu w Polsce słońce zachodzi ok. 15:30, a szczyt zapotrzebowania przypada na 16:00–18:00. Produkcja PV spada do zera **dokładnie w chwili**, gdy zapotrzebowanie rośnie najszybciej. Wieczorna rampa w grudniu jest najstromszym i najtrudniejszym momentem całej gry — i wynika bezpośrednio z geometrii z sekcji 3.

---

## 10. Konfigurowalność — plany na przyszłość

Poniższe elementy **nie wchodzą do wersji podstawowej**, ale model należy od początku pisać tak, żeby dało się je dodać bez przebudowy.

### 10.1 Szerokość geograficzna i kraje wieloszerokościowe

Wszystkie wzory z sekcji 3 przyjmują `φ` jako parametr — działają dla dowolnej szerokości bez zmian. Wystarczy wystawić `φ` do konfiguracji.

**Wariant dla dużych krajów:** kraj definiowany przedziałem `φ_południe … φ_północ`, a każde miasto i każda elektrownia dostaje `φ` interpolowaną ze swojej pozycji na mapie heksagonalnej.

| Kraj | Zakres φ | Różnica długości dnia w przesileniu |
|---|---|---|
| Polska | 49 – 55° N | ~70 min |
| Francja | 42 – 51° N | ~90 min |
| Norwegia | 58 – 71° N | **dzień polarny na północy** |
| Chile | 18 – 56° S | ekstremalna |

Efekt na rozgrywkę byłby realny: farma PV na południu kraju produkuje więcej niż identyczna na północy, a zimowy szczyt zaczyna się wcześniej w regionach północnych. Przy krajach polarnych wchodzi noc polarna — dramatyczna zmiana zasad gry.

### 10.2 Strefy klimatyczne

| Strefa | Charakterystyka | Wpływ na strategię |
|---|---|---|
| **Umiarkowana morska** (Irlandia, UK) | bardzo wietrznie, łagodnie, pochmurno | wiatr dominuje, PV bez sensu, mały sezonowy skok popytu |
| **Umiarkowana przejściowa** (Polska) | **baseline** | zbilansowany miks, zimowy szczyt |
| **Umiarkowana kontynentalna** (Ukraina) | ostre zimy, gorące lata, słabszy wiatr | dwa szczyty w roku, trudna zima |
| **Nordycka / subarktyczna** | noc polarna, dużo wód | hydroenergetyka dominuje, PV zbędne |
| **Śródziemnomorska** (Hiszpania) | dużo słońca, łagodna zima | PV dominuje, **szczyt letni** od klimatyzacji |
| **Pustynna** (Bliski Wschód) | ekstremalne PV, brak wody | brak chłodzenia dla bloków cieplnych, szczyt letni ekstremalny |
| **Tropikalna** | dzień zawsze ~12 h, monsun | brak sezonowości temperatury, sezonowość opadów |

Każda strefa to: zestaw reżimów pogodowych, ich rozkłady miesięczne, parametry temperatury i wiatru. Struktura danych jest ta sama — zmieniają się liczby. **Dlatego warto od razu trzymać parametry klimatu w pliku konfiguracyjnym, a nie w kodzie.**

### 10.3 Rozmiar kraju i liczba sąsiadów

| Parametr | Zakres | Wpływ |
|---|---|---|
| Rozmiar mapy | 24×16 … 96×64 heksów | długości linii, liczba miast, skala systemu |
| Liczba sąsiadów | 0 – 6 | 0 = **wyspa energetyczna** (brak importu, najtrudniejszy wariant) |
| Charakter sąsiadów | losowany lub konfigurowany | sąsiad jądrowy = stabilny import; sąsiad wiatrowy = tani, ale zmienny |
| Korelacja pogody z sąsiadami | zależna od odległości | **kluczowe** — bliski sąsiad ma tę samą pogodę, więc Dunkelflaute dotyka obu jednocześnie i import jest niedostępny wtedy, gdy najbardziej potrzebny |
| Rozpiętość geograficzna | jedna φ / przedział | patrz 10.1 |

Ostatni wiersz zasługuje na podkreślenie: **korelacja pogody między krajami jest mechaniką, nie szczegółem**. Strategia „nie buduję rezerw, w razie czego zaimportuję" musi zawodzić dokładnie wtedy, gdy jest najbardziej potrzebna — bo sąsiad ma ten sam wyż nad głową. To jedna z najważniejszych lekcji, jakie gra ma przekazać.

---

## 11. Parametry do strojenia — zestawienie

| Parametr | Wartość startowa | Wpływ |
|---|---|---|
| `latitude` | 52,0° N | długość dnia, wysokość słońca |
| `haurwitz_a` / `haurwitz_b` | 1098 / 0,057 | poziom nasłonecznienia bezchmurnego |
| `cloud_exponent` | 3,4 | jak mocno chmury tną produkcję PV |
| `cloud_floor` | 0,25 | produkcja przy pełnym zachmurzeniu |
| `pv_temp_coeff` γ | −0,004 /°C | strata mocy PV od temperatury |
| `pv_system_eff` | 0,85 | straty falownika, zabrudzenia, okablowania |
| `weibull_k`, `weibull_lambda` | 2,0 / 6,6 | rozkład wiatru na lądzie |
| `wind_shear_a` | 0,14 | zysk z wyższej wieży |
| `v_in`, `v_rated`, `v_out` | 3 / 12 / 25 m/s | krzywa mocy turbiny |
| `temp_annual_mean`, `temp_annual_amp` | 9,0 / 10,5 °C | przebieg roczny temperatury |
| `regime_persistence` | 0,6–0,8 | jak długo trzyma się pogoda |
| `wind_noise_amplitude` | 0,25 | zmienność wiatru w dobie = obciążenie dyspozytora |
| `wind_noise_correlation_time` | 2,5 h | płynność wahań wiatru |
| `forecast_error_base` | do ustalenia | trudność planowania doby |

---

## 12. Weryfikacja modelu

Implementacja jest poprawna, jeśli spełnia poniższe kontrole:

| # | Test | Oczekiwany wynik |
|---|---|---|
| 1 | Długość dnia, 21 czerwca, φ=52° | 16 h 44 min ±5 min |
| 2 | Długość dnia, 21 grudnia, φ=52° | 7 h 44 min ±5 min |
| 3 | Długość dnia w równonoc | 12 h 07 min (nieco ponad 12 h wskutek refrakcji) |
| 4 | α_max, 21 czerwca / 21 grudnia | 61,5° / 14,6° |
| 5 | GHI_clear w południe, czerwiec | 880–920 W/m² |
| 6 | Roczny CF instalacji PV | 11–12% |
| 7 | Roczny CF wiatru na lądzie (teren otwarty, wybrzeże) | 24–30% |
| 8 | Roczny CF wiatru na Bałtyku | 45–50% |
| 9 | Stosunek energii PV grudzień : czerwiec | 1 : 10 do 1 : 12 |
| 10 | Średnia prędkość wiatru styczeń : lipiec | ~1,43 : 1 |
| 11 | Suma godzin z v ≥ 25 m/s w roku | 10–40 h (wyłączenia sztormowe) |
| 12 | Epizody Dunkelflaute w kalendarzu gry, na rok gry (definicja niżej) | doby: 4–6; epizody ≥2 dób: 1,0–1,5; epizody ≥3 dób: 0,8–1,4 |
| 13 | Roczny CF wiatru w terenie osłoniętym (klasa z 0.5; por. test 7) | 13–18% |
| 14 | CF klasy morskiej **warunkowo na reżim** (0.8; definicja niżej) | Dunkelflaute ≤1%; sztorm **niżej niż klasa otwarta**; cały rok ≥1,6 × klasy otwartej |

Testy 1–5 są **deterministyczne** i muszą przechodzić dokładnie. Testy 6–14 są statystyczne — weryfikować na symulacji 20+ lat.

### 12.12 — definicja epizodu Dunkelflaute w kalendarzu gry

**Doba Dunkelflaute** to doba gry, która spełnia oba warunki naraz:

1. reżim doby to wyż zimowy — mroźny albo mglisty (§8.2);
2. dobowy CF referencyjnego portfela OZE (1 MW wiatru w terenie otwartym + 1 MW PV,
   §5–§6) jest **poniżej 10%** mocy zainstalowanej.

**Epizod** to maksymalny ciąg kolejnych dób Dunkelflaute — także przez granicę
miesiąca, bo reżim losuje się miesiącami (§8.4) i dwa wyżowe miesiące z rzędu dają
jeden długi epizod, a nie dwa krótkie.

Warunek 2 jest w praktyce prawie zawsze spełniony, gdy spełniony jest 1 (średni CF
doby wyżowej to ~2,6%), i pełni rolę zabezpieczenia: gdyby strojenie reżimów kiedyś
przepuściło wiatr do wyżu zimowego, doba przestanie się liczyć jako Dunkelflaute.

**Dlaczego pasma są inne niż w 0.5.** Do 0.5 test brzmiał „liczba epizodów ≥3 doby
w roku = 2–5" i była to statystyka **kalendarza rzeczywistego**. W grze doba
reprezentuje ~10,13 dnia rzeczywistego (01 §2.1), więc epizod „≥3 doby gry" to
~30 dni rzeczywistych — wielkość, która w rzeczywistej pogodzie nie występuje, a
liczba epizodów w kalendarzu gry jest z definicji kilkukrotnie mniejsza niż
w rzeczywistym. Pasma wyżej są przeliczone na doby gry i zmierzone na pełnym torze
generacji (100 lat symulacji, 6 ziaren: doby 4,56–4,98; epizody ≥2 dób 1,19–1,28;
≥3 dób 1,06–1,23). W przeliczeniu na kalendarz rzeczywisty odpowiada to ~47 dniom
warunków Dunkelflaute rocznie — górna część tego, co daje pasmo z 0.5 (2–5 epizodów
po 3–10 dni). Jeśli strojenie ekonomii uzna to za zbyt częste, właściwym miejscem
korekty są miesięczne wagi reżimów (§8.3), a nie ten test.

### 12.14 — klasa morska warunkowo na reżim (0.8)

Test 8 mówi tylko, **ile** energii daje Bałtyk w skali roku. Odkąd wiatr morski jest
w grze (01 §5.2 w 0.22), potrzebny jest test na to, **kiedy** jej nie daje — bo na tym
opiera się cała ocena wpływu tej technologii na rozgrywkę. CF liczy się jak w teście 8
(średnia `turbinePowerFraction` po godzinach), ale osobno dla dób każdego reżimu §8.2:

| Warunek | Pasmo | Pomiar (60 lat, ziarno 20260820) |
|---|---|---|
| doby wyżu zimowego (`frostHigh`, `fogHigh`) | ≤ 1% | **0,1%** (klasa otwarta 0,0%) |
| doby sztormowe (`storm`) | **poniżej** klasy otwartej | **78,1%** wobec 87,1% |
| cały rok | ≥ 1,6 × klasy otwartej | **47,4%** wobec 26,1% (1,82×) |

**Co ten test pilnuje.** Reżimowy mnożnik wiatru (§8.2: 0,25 dla mroźnego wyżu, 0,20 dla
mglistego) ścina λ = 10,2 poniżej prędkości startowej turbiny (§6.3: 3 m/s) tak samo jak
λ = 7,3 — więc **morze nie rozbraja Dunkelflaute**. W sztormie jest odwrotnie: morze
siedzi już na plateau i szybciej przebija wyłączenie przy 25 m/s, więc **gaśnie przed
lądem** (godziny z v ≥ 25 m/s: 1,45% wobec 0,08%). Cała przewaga klasy morskiej pochodzi
z reżimów zwyczajnych — niżu atlantyckiego, letniego i pogody przejściowej.

Konsekwencja dla dokumentu 01: wiatr morski dokłada **energii bazowej, nie mocy
w kryzysie**, a najbardziej zmienia lato (CF VI–VIII 0,29–0,34 wobec 0,10–0,13 na lądzie
otwartym). Gdyby strojenie reżimów kiedyś przepuściło morze przez Dunkelflaute, ten test
zapali się jako pierwszy — i to jest jego właściwa rola.

---

## 13. Kolejność implementacji

1. **Warstwa astronomiczna** (sekcja 3) — czysta funkcja `(φ, n, h) → α`. Bez stanu, łatwa do przetestowania. Testy 1–4.
2. **Nasłonecznienie bezchmurne** (sekcja 4.1–4.3) — nadal deterministyczne. Test 5.
3. **Produkcja PV przy stałym zachmurzeniu** — pierwszy sensowny wynik do obejrzenia na wykresie.
4. **Model temperatury** (sekcja 7) — potrzebny do sprawności PV i do zapotrzebowania.
5. **Wiatr statyczny** — Weibull + krzywa mocy, bez przebiegu czasowego. Testy 7–8.
6. **Reżimy pogodowe** (sekcja 8.2–8.4) — łańcuch Markowa. Test 12.
7. **Zmienność wewnątrzdobowa** (sekcja 8.5) — dopiero tutaj powstaje właściwa mechanika bilansowania.
8. **Generacja prawdy z góry + błąd prognozy** (sekcja 8.6) — w rozgrywce turowej to nie jest element ostatni, tylko **warunek działania tury**: bez prognozy gracz nie ma na czym oprzeć decyzji, bo nie widzi stanu bieżącego. Krok 7 i 8 należy zrobić razem.

Krok 7 to moment, w którym prototyp zaczyna odpowiadać na najważniejsze pytanie z dokumentu 01: **czy bilansowanie jest frajdą, czy pracą.** Wcześniejsze kroki tego nie zweryfikują — bez wahań wiatru nie ma czego bilansować.

---

*Wartości liczbowe dla Polski oparte na danych klimatologicznych; wymagają weryfikacji na etapie prototypu. Wzory astronomiczne są dokładne i nie podlegają strojeniu.*
