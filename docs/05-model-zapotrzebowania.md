# ElectroNation — Model zapotrzebowania

**Wersja:** 0.2
**Data:** 2026-08-13
**Status:** **obowiązuje** — definiuje model zapotrzebowania i wzrost miast; zastępuje
tymczasowy mechanizm wzrostu z dokumentu 01 (§2.7, §5.6 — zaktualizowane w 01 v0.14).
Dokument 06 (astronomia/pogoda, błąd prognozy) obowiązuje bez zmian — ten dokument
tylko z niego korzysta.

**Zmiany 0.1 → 0.2:** szkic zatwierdzony przez projektanta — dokument obowiązuje;
dokument 01 podbity do 0.14 (uchylona tymczasowa formuła logistyczna z 01 §2.7/§5.6).
Rozstrzygnięte dawne pytanie otwarte nr 1 (§10): głębsza dolina nocna (~48% szczytu)
i szczyt doby wolnej ~90% **zaakceptowane jako cele profilu** — 01 §5.6 zaktualizowany.

**Decyzje projektanta (2026-08-13), które ten dokument zapisuje:**

1. Miasto opisują **dwie liczby stanu: gospodarstwa domowe i firmy** — to jest źródło
   prawdy o mieście, widoczne w szczegółach po kliknięciu (§2, §7).
2. Każdy segment ma **własny profil dobowy** (godzinowy) i własne zużycie jednostkowe:
   gospodarstwo ~10 kWh/dobę, firma ~50 kWh/dobę roboczą; w dobę wolną firmy pobierają
   znacznie mniej (§3).
3. Wzrost miasta: **energia niedostarczona < 1% w miesiącu → wzrost losowy 0–4%**,
   losowany **niezależnie dla gospodarstw i dla firm** (§6.2).
4. Pasmo **90–99% dostarczenia = stagnacja**; **poniżej 90% → miasto kurczy się o połowę
   niedostarczonego udziału** (§6.3).
5. **Wysycanie**: wylosowany wzrost jest tłumiony logistycznie względem pojemności miasta
   (16× stan startowy, parametr z 01 §2.7) — miasto w końcu dobija do maksimum (§6.2).
6. **Podłoga**: miasto nigdy nie umiera — minimum 100 gospodarstw i 10 firm (§6.3).
7. **Miasta niepodłączone są zamrożone** — nie rosną i nie kurczą się (01 §3.4:
   brak podłączenia nie jest karą) (§6.5).
8. Procent dostarczenia liczony **per miasto** (silnik nie rozróżnia odbiorców w węźle);
   ocena **miesięczna**, z wagami dób reprezentatywnych (§6.1).
9. Losowania z seedowanego PRNG (nazwany strumień), stałe reguły zaokrągleń — pełny
   determinizm (§6.6).
10. Klasy wielkości miast z 01 §5.6 zostają jako **etykiety pochodne**; zużycie
    jednostkowe 10/50 kWh to **średnie roczne** — mnożnik sezonowy i pogoda nakładają
    się na wierzchu (§4, §5).

---

## 1. Cel i zakres

Dokument definiuje, skąd bierze się **prawdziwe zapotrzebowanie** każdego przyłączonego
miasta w każdej godzinie doby reprezentatywnej oraz **jak miasta rosną i kurczą się**
w reakcji na jakość zasilania. Zakres zgodny z 01 §12: profile godzinowe, sezonowość,
czynnik pogodowy, wzrost miast. Prognoza zapotrzebowania (widok gracza) pozostaje
zdefiniowana w 06 §8.6 i stosuje się bez zmian do zagregowanego popytu miasta.

Powiązania: 01 §2.1 (3 doby reprezentatywne), §2.2 (prawda godzinowa, tura widzi średnie
bloku), §3.4 (miasta niepodłączone), §4.5 (energia niedostarczona), §5.6 (klasy miast);
06 §7.3 i §9 (wpływ temperatury i astronomii na popyt), §8.6.2 (σ_popyt).

## 2. Miasto = gospodarstwa domowe + firmy

**DECYZJA: stan miasta to dwie liczby całkowite:**

- `G` — liczba **gospodarstw domowych**,
- `F` — liczba **firm** (zagregowane MŚP i usługi; przemysł ciężki jako osobny segment
  pozostaje odłożony — 90 §9).

To jest **jedyne źródło prawdy** o wielkości miasta. Wszystko inne — szczyt MW, klasa
wielkości (małe/średnie/duże z 01 §5.6), ewentualna „ludność" do celów fabularnych —
jest **pochodną wyświetlaną**, nigdy stanem. Proporcja `G:F` może z czasem dryfować
(niezależne losowania wzrostu — §6.2), więc profil dobowy miasta powoli się indywidualizuje.

## 3. Zużycie jednostkowe i profile godzinowe segmentów

### 3.1 Energia dobowa na jednostkę (średnie roczne)

| Segment | Doba robocza | Doba wolna | Uwagi |
|---|---|---|---|
| Gospodarstwo domowe | **10 kWh** | **10,5 kWh** (×1,05) | w dzień wolny ludzie są w domu |
| Firma | **50 kWh** | **15 kWh** (×0,30) | zostaje pobór bazowy: chłodnie, serwery, ruch zmianowy |

Wartości są **średnimi rocznymi** — mnożnik sezonowy (§4.2) ma średnią roczną ≈ 1,00,
więc energie te są jednocześnie średnimi w skali roku.

### 3.2 Profile godzinowe

Profil = 24 mnożniki względem **średniej mocy dobowej segmentu** (średnia profilu = 1,00;
suma = 24,00). Moc segmentu w godzinie `h`: `(energia dobowa / 24 h) × profil(h)`.
Prawda pozostaje **godzinowa** (01 §2.2) — tura widzi średnią swojego bloku 3 h.

| h | Gosp. robocza | Gosp. wolna | Firma robocza | Firma wolna |
|---|---|---|---|---|
| 00 | 0,80 | 0,85 | 0,55 | 0,90 |
| 01 | 0,70 | 0,75 | 0,55 | 0,90 |
| 02 | 0,65 | 0,70 | 0,55 | 0,90 |
| 03 | 0,65 | 0,65 | 0,55 | 0,90 |
| 04 | 0,70 | 0,65 | 0,55 | 0,90 |
| 05 | 0,80 | 0,70 | 0,60 | 0,90 |
| 06 | 0,95 | 0,75 | 0,75 | 1,00 |
| 07 | 1,05 | 0,85 | 1,05 | 1,05 |
| 08 | 1,05 | 1,00 | 1,35 | 1,05 |
| 09 | 0,95 | 1,05 | 1,55 | 1,10 |
| 10 | 0,95 | 1,10 | 1,65 | 1,10 |
| 11 | 0,95 | 1,10 | 1,65 | 1,10 |
| 12 | 0,95 | 1,10 | 1,60 | 1,10 |
| 13 | 0,95 | 1,05 | 1,60 | 1,10 |
| 14 | 0,95 | 1,00 | 1,55 | 1,10 |
| 15 | 0,95 | 1,00 | 1,45 | 1,05 |
| 16 | 1,10 | 1,10 | 1,35 | 1,05 |
| 17 | 1,30 | 1,25 | 1,10 | 1,05 |
| 18 | 1,45 | 1,40 | 0,90 | 1,05 |
| 19 | 1,50 | 1,45 | 0,75 | 1,00 |
| 20 | 1,40 | 1,35 | 0,65 | 1,00 |
| 21 | 1,25 | 1,20 | 0,60 | 0,90 |
| 22 | 1,05 | 1,05 | 0,55 | 0,90 |
| 23 | 0,95 | 0,90 | 0,55 | 0,90 |

Charaktery: gospodarstwa — dolina nocna, rampa poranna, **szczyt wieczorny 18–20**;
firmy — pobór skupiony w godzinach pracy z **plateau 9–15**, noc = pobór bazowy;
doba wolna firm — niemal płaska, sama „podstawa".

### 3.3 Emergentny profil miasta

Przy kalibracyjnym podziale energii **~70% gospodarstwa / ~30% firmy** (doba robocza)
zagregowany profil miasta wychodzi:

- szczyt dobowy: **wieczorny, godz. 18–19** (jak dotąd);
- garb przedpołudniowy: **~90% szczytu** (cel 01 §5.6: 85–90% ✓);
- dolina nocna: **~48% szczytu** — głębiej niż dawne 55–65%, bo nie ma już ukrytego
  przemysłu bazowego w zagregowanym profilu (patrz §10 pyt. 1);
- doba wolna: energia **~82%** doby roboczej, szczyt **~90%** szczytu roboczego
  (dawny cel „szczyt ~80%" — patrz §10 pyt. 1).

## 4. Prawdziwe zapotrzebowanie godzinowe

### 4.1 Formuła

```
D(miasto, h) = [ G × e_G(typ) × p_G(h, typ) + F × e_F(typ) × p_F(h, typ) ] / 24 h
               × m_sezon(miesiąc) × m_pogoda(T)
```

gdzie `typ` ∈ {robocza, wolna} (doba reprezentatywna — 01 §2.1), `e` — energia dobowa
z §3.1, `p` — profil z §3.2, a mnożniki jak niżej. Prawda jest generowana w całości
przy inicie doby i kwantyzowana na granicy generacji (zasady determinizmu — dokument 10);
prognoza to jej zaszumiony widok wg 06 §8.6 (σ_popyt bez zmian, liczona od zagregowanego
szczytu miasta).

### 4.2 Mnożnik sezonowy (miesięczny)

Zakres z 01 §5.6 (~0,85 maj … ~1,15 styczeń), rozpisany tak, by średnia roczna ≈ 1,00:

| Sty | Lut | Mar | Kwi | Maj | Cze | Lip | Sie | Wrz | Paź | Lis | Gru |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1,15 | 1,12 | 1,05 | 0,95 | 0,85 | 0,87 | 0,90 | 0,90 | 0,95 | 1,02 | 1,08 | 1,13 |

### 4.3 Mnożnik pogodowy (temperaturowy)

Krzywa „V" z 06 §7.3 (ogrzewanie poniżej ~15 °C, klimatyzacja powyżej ~22 °C),
temperatura z reżimu pogodowego (06 §8.2):

```
m_pogoda(T) = 1 + 0,008 × max(0, 15 − T) + 0,010 × max(0, T − 22),  ograniczone do ≤ 1,25
```

Propozycja do strojenia (dokument 03 / playtesty). Efekt: fala mrozów −20 °C daje
+25% (cap) — razem z mnożnikiem stycznia ~1,15 popyt Dunkelflaute sięga ~1,4× średniej
rocznej. Wpływ astronomii na profil wieczorny (06 §9) — patrz §10 pyt. 2.

## 5. Kalibracja: klasy miast → liczby jednostek

Pochodne z §3: średnia moc gospodarstwa 0,42 kW, firmy 2,08 kW; w szczycie wieczornym
doby roboczej stycznia miasto pobiera **~0,88 kW na gospodarstwo** (z proporcjonalnym
udziałem firm przy podziale energii 70/30, tj. `F ≈ 0,086 × G`).

Klasy z 01 §5.6 (szczyt zapotrzebowania) przekładają się orientacyjnie na:

| Klasa (etykieta pochodna) | Szczyt | Gospodarstwa `G` | Firmy `F` |
|---|---|---|---|
| małe | 50–150 MW | ~57–170 tys. | ~5–15 tys. |
| średnie | 150–500 MW | ~170–570 tys. | ~15–49 tys. |
| duże | 500–1500 MW | ~0,57–1,7 mln | ~49–147 tys. |

**DECYZJA:** klasy MW zostają, liczby jednostek są duże i tak ma być (10/50 kWh to
świadomie zawyżone-na-grywalność średnie roczne). Konkretne `G`, `F` i podział 70/30
per miasto przydziela generator mapy (dokument 07); podział może się różnić między
miastami (miasto „sypialnia" vs „biznesowe") — parametr generatora.

## 6. Wzrost i kurczenie miast

### 6.1 Miesięczna ocena dostarczenia

Po rozstrzygnięciu ostatniej tury **doby Wolnej** (koniec miesiąca), dla każdego miasta
**przyłączonego przez cały miesiąc**:

```
U = Σ_d w_d × E_dostarczona(d)  /  Σ_d w_d × E_zapotrzebowana(d)
```

po trzech dobach reprezentatywnych z wagami `w_d` = 10,9 / 10,9 / 8,7 (01 §2.1).
Obie energie z **prawdy** (faza rozstrzygnięcia): zapotrzebowanie wg §4, dostarczenie
z rozpływu; energia niedostarczona = `1 − U` (spójne z 01 §4.5). Ocena jest **per
miasto** — silnik dowozi moc do węzła i nie rozróżnia, czy prąd trafił do gospodarstw
czy firm; wynik `U` stosuje się do obu segmentów.

### 6.2 Wzrost: `U > 99%`

**DECYZJA: miasto rośnie, gdy energia niedostarczona w miesiącu jest mniejsza niż 1%.**
Wtedy dla każdego segmentu **niezależnie**:

```
g = losowo z przedziału [0%, 4%]          (rozkład jednostajny, osobne losowanie dla G i F)
g_eff = g × (1 − N / N_max)               (tłumienie logistyczne)
N ← round(N × (1 + g_eff))
```

`N_max` = **pojemność segmentu = 16 × stan startowy** (parametr przejęty z 01 §2.7),
ustalana przy generacji mapy i **stała** — nie rekalibruje się po spadkach. Młode miasto
rośnie niemal pełnym tempem (średnio ~2%/mies.), przy połowie pojemności ~1%/mies.,
przy suficie wzrost zamiera — **miasto w końcu dobija do maksimum**, a pełna mapa
zbiega do 20–30 GW (01 §3.4) bez twardego progu.

*Uwaga o tempie (świadoma decyzja):* średnio ~2%/mies. dla młodego, w pełni zasilanego
miasta to ~25%/rok — wyraźnie szybciej niż dawne ~10%/rok z 01 §2.7. Zakład „budowa vs
wzrost popytu" (01 §2.6) robi się ostrzejszy; walidacja pacingu — dokument 03 i playtesty.

### 6.3 Stagnacja i kurczenie

- **`90% ≤ U ≤ 99%` — stagnacja:** stan bez zmian. Kary finansowe za energię
  niedostarczoną (01 §4.5) naliczają się niezależnie, jak dotąd.
- **`U < 90%` — kurczenie:** oba segmenty maleją o **połowę niedostarczonego udziału**:

```
s = (1 − U) / 2                            (np. U = 60% → s = 20%)
N ← max( N_min , round(N × (1 − s)) )
```

Kurczenie **nie jest** tłumione pojemnością. Mechanizm jest samostabilizujący: miasto
kurczy się w stronę tego, co gracz faktycznie potrafi dostarczyć.

**DECYZJA — podłoga: miasto nigdy nie umiera:** `N_min` = **100 gospodarstw
i 10 firm**. Z podłogi zawsze da się odbić (100 gospodarstw × 4% = 4 gospodarstwa —
zaokrąglanie do najbliższej całości działa).

### 6.4 Konsekwencja pasm (zamierzona)

Po udanym wzroście popyt może lekko przekroczyć możliwości sieci → miasto wpada w pasmo
stagnacji i **zamiera aż do rozbudowy** — czytelny sygnał „doinwestuj". Chroniczne
wieczorne niedobory poniżej 10% energii miesięcznej nie kurczą miasta (tylko kary
finansowe) — zostaje, przynajmniej na razie (patrz §10 pyt. 3).

### 6.5 Miasta niepodłączone i świeżo przyłączone

**DECYZJA: reguły wzrostu i kurczenia dotyczą wyłącznie miast przyłączonych.**
Miasto niepodłączone jest **zamrożone** (nie rośnie, nie kurczy się, `U` się nie
liczy) — spójne z 01 §3.4: brak podłączenia nie jest karą. Miasto przyłączone w trakcie
miesiąca wchodzi do oceny od **pierwszego pełnego miesiąca** po przyłączeniu
(przychód z taryfy płynie oczywiście od chwili przyłączenia).

### 6.6 Determinizm i zaokrąglenia

- Losowania z **seedowanego PRNG, nazwany strumień** (np. `city-growth`), nigdy
  `Math.random`. Co miesiąc losuje się **dokładnie 2 wartości na każde miasto mapy**
  (G i F), w rosnącym porządku id miast, **niezależnie od tego, czy miasto podlega
  ocenie** — nieużyte losowania się odrzuca. Dzięki temu wyrównanie strumienia nie
  zależy od wyniku gracza.
- Losowań nie da się pre-generować przy inicie (zależą od `U`), ale przy stałym seedzie
  i logu akcji są w pełni odtwarzalne.
- `G`, `F` — liczby całkowite w stanie (JSON); zaokrąglanie do najbliższej całości
  (0,5 w górę).

## 7. Prezentacja w UI

Panel heksa miasta (01 §8) pokazuje **stan źródłowy**: liczbę gospodarstw domowych
i liczbę firm; do tego pochodne: etykietę klasy, szczyt MW, nasycenie (`N / N_max`),
`U` poprzedniego miesiąca i status (**wzrost / stagnacja / kurczenie / niepodłączone**).
Raport tury (01 §2.3 faza 4) bez zmian; zmiana wielkości miasta to zdarzenie raportu
końca miesiąca.

## 8. Parametry do strojenia — zestawienie

| Parametr | Wartość | Źródło |
|---|---|---|
| Energia dobowa gospodarstwa (robocza / wolna) | 10 / 10,5 kWh | §3.1 |
| Energia dobowa firmy (robocza / wolna) | 50 / 15 kWh | §3.1 |
| Profile godzinowe segmentów | tabela §3.2 | §3.2 |
| Podział energii miasta gospodarstwa/firmy | ~70/30 (parametr generatora) | §5 |
| Mnożniki sezonowe | tabela §4.2 (śr. roczna ≈ 1,00) | §4.2 |
| Mnożnik pogodowy | +0,8%/°C poniżej 15 °C, +1,0%/°C powyżej 22 °C, cap 1,25 | §4.3 |
| Próg wzrostu / kurczenia | `U > 99%` / `U < 90%` | §6 |
| Wzrost miesięczny | losowy 0–4%, niezależnie G i F | §6.2 |
| Pojemność segmentu | 16 × stan startowy | §6.2 |
| Kurczenie | połowa niedostarczonego udziału | §6.3 |
| Podłoga | 100 gospodarstw, 10 firm | §6.3 |
| Wagi dób w ocenie miesiąca | 10,9 / 10,9 / 8,7 | §6.1 |

## 9. Testy akceptacyjne

Każda implementacja musi przejść (konwencja jak 06 §12; testy specyfikacyjne cytują
sekcje tego dokumentu):

1. **§3.2** — każdy z 4 profili sumuje się do 24,00 ± 0,01 (średnia 1,00).
2. **§3.3** — profil miasta 70/30, doba robocza: szczyt w godz. 18–19; garb
   przedpołudniowy 85–95% szczytu; dolina nocna 44–52% szczytu.
3. **§3.3** — doba wolna: energia 80–85% doby roboczej; szczyt 87–93% szczytu roboczego.
4. **§4.2** — średnia roczna mnożników sezonowych = 1,00 ± 0,01.
5. **§6.1** — niedobór wyłącznie w dobie wolnej obniża `U` z wagą 8,7/30,4 (a nie 1/3).
6. **§6.2** — miasto z `U > 99%` przez rok rośnie; przy `N → N_max` wzrost zamiera
   (≤ 0,05%/mies. przy 99% pojemności).
7. **§6.3** — `U = 60%` → oba segmenty −20%; podłoga 100/10 nigdy nie przebita.
8. **§6.5** — miasto niepodłączone: stan identyczny po dowolnej liczbie lat.
9. **§6.6** — determinizm: ten sam seed + ten sam log akcji → identyczne `G`, `F`
   po 20 latach symulacji; zmiana kolejności ocen miast nie zmienia wyniku.
10. **§4** — prognoza popytu: σ_popyt wg 06 §8.6.2 liczona od zagregowanego szczytu
    miasta; prawda ≠ prognoza.

## 10. Pytania otwarte

1. **Reakcja profilu wieczornego na godzinę zachodu słońca** (06 §9): świadomie
   pominięta — sezonowość niesie mnożnik miesięczny, profil ma stały kształt. Do rewizji,
   jeśli grudniowa rampa wieczorna okaże się za mało dramatyczna.
2. **Chroniczne wieczorne blackouty w pasmie 90–99%** nie mają skutku demograficznego —
   decyzja: na razie zostaje; wrócić po playtestach (ewentualnie próg per doba albo
   podniesienie progu 90%).
3. **Asymetria kurczenia** (firmy uciekają szybciej niż rodziny) — smaczek odłożony;
   wraca ewentualnie razem z segmentami z 90 §9.
4. **Tempo wzrostu 0–4%/mies.** (~25%/rok dla młodych miast) vs dawne ~10%/rok —
   zatwierdzone; walidacja napięcia „budowa vs popyt" w dokumencie 03 i playtestach.

*(Dawne pytanie nr 1 — głębsza dolina nocna i wyższy szczyt doby wolnej — rozstrzygnięte
w 0.2: zaakceptowane, 01 §5.6 zaktualizowany.)*

## 11. Wpływ na inne dokumenty

- **01 §2.7, §5.6** — zaktualizowane w 01 v0.14: tymczasowa formuła logistyczna uchylona
  na rzecz §6; zagregowany profil z §5.6 zastąpiony profilami segmentów (§3); klasy miast
  zostają jako etykiety. Tabela decyzji 01 §11 i pytania otwarte — zaktualizowane.
- **03 (ekonomia)** — sprzężenie: wzrost miast ↔ przychód z taryfy ↔ tempo budów;
  strojenie mnożnika pogodowego (§4.3).
- **07 (generator mapy)** — przydziela `G`, `F`, podział 70/30 i pojemności per miasto.
- **90 §9** — segmenty dodatkowe (przemysł ciężki, prosumenci, DSR) pozostają odłożone.
