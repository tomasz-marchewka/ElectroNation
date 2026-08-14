# M7 — Budowanie z UI: panel heksa, katalog, trasowanie linii

**Warstwa:** UI (`src/app/`). **Zależności:** M2 (mapa, `borderSites`),
M3 (akcje rozbudowy/anulowania), M5 (mapa, selekcja), M6 (panel).
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §3.3–3.4, §5,
§7, §8 pkt 6; 02 §8, §10 pkt 2; funkcja `HexPanel` w
`design-system/ui_kits/dispatcher/DispatcherScreen.jsx` (linie ~326–392 — jedyna
specyfikacja panelu heksa, nie ma go w `components/`); `src/engine/build.ts`
(walidacje — mają zostać jedynym źródłem prawdy), `src/engine/config.ts`.

## Cel

Klik na dowolny heks otwiera panel heksa w prawej kolumnie (zastępuje panel
dyspozytora — ta sama kolumna 400 px), z informacjami o terenie, katalogiem
budowy (jedyna droga budowania — 01 §8 pkt 6) i akcjami obiektu; z panelu
prowadzi się linie z auto-trasą i ręczną korektą. Silnik waliduje wszystko —
UI tylko uprzedza gracza, czemu czegoś nie można.

## Zakres

### 1. Panel heksa — komponent właściwy

`src/app/components/HexPanel.tsx` (markup wg funkcji `HexPanel` z buildu
referencyjnego). Nagłówek `HEKS q<q> r<r> · 25 × 25 KM` (współrzędne osiowe
silnika). Stopka zawsze: `◂ WRÓĆ DO PANELU DYSPOZYTORA` (czyści selekcję).

**Sekcja `TEREN`** (zawsze): TYP (polska nazwa biomu), MNOŻNIK KOSZTU
(z `TERRAIN` — **nie** z etykiet designu), WIATR @100 M (średnia klasy heksa
z `WIND_CLASSES`), NASŁONECZNIENIE (mnożnik z M2), SZCZYTOWO-POMPOWA:
`możliwa` / `wymaga gór/wyżyny i wody obok` — **reguła silnika z M2**
(góry/wyżyna + woda w sąsiedztwie; design gubił warunek wody — docs wygrywają).
Do tego lista linii przechodzących przez heks (typ, obciążenie ostatniej tury,
dokąd biegną) — wymagana przez 01 §8 pkt 6, w designie pominięta.

**Heks pusty — sekcja `KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU`:**

- Pozycje generowane z `CONFIG` (nigdy hardkod): 4 elektrownie (`PLANT_TECHS`,
  wybór mocy bloku w granicach `maxBlockMw` — prosty input/krokowanie), wiatr
  i PV (`FARM_TECHS`, do limitu heksa), **bateria z osobnym doborem modułów mocy
  i pojemności** (01 §5.3: gracz musi rozumieć MW vs MWh osobno; wpis designu
  „150 MW / 300 MWh — 900 mln" jest błędny — z `BATTERY` wychodzi 570 mln),
  szczytowo-pompowa (tylko heks spełniający regułę), stacja rozdzielcza,
  przyłącze graniczne (tylko heksy z `borderSites` M2).
- Cena = CAPEX × mnożnik terenu, czas budowy w dobach — wartości liczone
  z `CONFIG`, format `mln/mld zł`. Pozycja nieosiągalna (teren wodny, limit,
  brak środków) jest wyszarzona z notą-diagnozą (np. `✕ budowa na wodzie
  niemożliwa`), nie ukryta.
- Tabela `LINIA Z TEGO HEKSA` (NN/SN/WN: przepustowość, straty %/100 km, cena
  za heks × mnożnik terenu, godziny budowy/heks) — z `LINE_TYPES`.
- Klik pozycji → `dispatch(buildX)`; sukces widoczny na mapie (budowa w toku,
  M5). Jeżeli akcja silnika okazała się no-opem (stan bez zmian), pokaż
  diagnozę z walidacji app-owej (patrz pkt 4).

**Heks z obiektem — sekcja `OBIEKT`:** RODZAJ (opis technologii), STAN
(`StatusDot`: danger, gdy obiekt uczestniczy w wąskim gardle albo miasto ma ENS
— z `lastTurnReport`), PRZYŁĄCZA `użyte / limit` (limit per obiekt — stacje
mają 6+2/moduł po M3), parametry (moc, SOC, pobór miasta itd. wg typu). Akcje
(ghost): `POPROWADŹ LINIĘ STĄD`, `ROZBUDUJ …` (per typ: elektrownia `+BLOK
<MW>`, farma `+<MW>`, bateria **dwie akcje** `+MOC` / `+POJEMNOŚĆ`, pompowa
`+BLOK 250 MW`, stacja `+MODUŁ 250 MW · +2 PRZYŁĄCZA`, graniczne `+500 MW` —
akcje M3, ceny/limity z silnika; przy limicie wyszarzone z notą), `PRZYŁĄCZ
MIASTO — 30 MLN ZŁ` (miasto nieprzyłączone + ukończona linia w heksie; akt
z 01 §3.4 — w designie go brakowało), `ANULUJ BUDOWĘ` (obiekt/linia w budowie;
z potwierdzeniem — nakłady przepadają, 01 §2.6), `POKAŻ WĄSKIE GARDŁO` (tylko
przy alercie: podświetla na mapie segment/węzeł o najwyższym wykorzystaniu
z raportu — ton danger, statycznie).

### 2. Trasowanie linii (01 §3.3, 02 §10 pkt 2)

Tryb prowadzenia linii po `POPROWADŹ LINIĘ STĄD`:

1. Wybór typu (NN/SN/WN — karta z tabelą kosztów),
2. hover po mapie → **podgląd auto-trasy na żywo**: A* po koszcie heksów
   (koszt wejścia w heks = `KM_PER_HEX × capexPlnPerKm × TERRAIN[teren].line`;
   heksy niedozwolone: poza mapą, obiekt bez wolnego przyłącza, korytarz z 9
   liniami tego typu; woda dozwolona z mnożnikiem) + sumaryczny koszt i czas
   budowy przy kursorze,
3. klik obiektu docelowego → trasa zatrzaśnięta; **korekta ręczna**: klik heksa
   pośredniego wstawia waypoint (A* liczy się per odcinek między waypointami),
   klik waypointa usuwa go,
4. `ZATWIERDŹ — <koszt> · <czas>` (primary w panelu trasowania) →
   `dispatch({type:"buildLine", lineType, path})`; `✕ ANULUJ` wychodzi z trybu.

A* w `src/app/routing/` (warstwa app — silnik nie trasuje), z testami
jednostkowymi: omija góry, gdy taniej naokoło; wchodzi w wodę, gdy warto;
respektuje zakazy; trasa jest łańcuchem sąsiadów akceptowanym przez silnik.

### 3. Przełączanie paneli

`selectedHex ≠ null` → panel heksa zastępuje panel dyspozytora (ta sama kolumna,
nigdy oba naraz). `ESC`/powrót czyści selekcję. Tryb trasowania blokuje zmianę
selekcji do zakończenia/anulowania.

### 4. Walidacje po stronie app

Silnik odrzuca nieprawidłowe akcje jako no-op (celowo, replay-safe) — UI musi
**uprzedzać**: moduł `src/app/validate.ts` odtwarza warunki z `build.ts`
(środki, teren, zajętość, limity przyłączy/korytarzy, granice mapy) wyłącznie
do komunikatów; źródłem prawdy pozostaje silnik. Komunikaty = diagnoza ze
źródłem liczby, po polsku.

## Kryteria akceptacji / testy

1. Testy komponentowe panelu: katalog na nizinie vs górach (ceny ×1,0 vs ×2,5 —
   liczone z `CONFIG`), heks wodny (obiekty zablokowane z notą, linie wycenione),
   heks z miastem nieprzyłączonym (akcja przyłączenia aktywna tylko przy
   ukończonej linii), obiekt z akcjami rozbudowy, budowa w toku z anulowaniem.
2. Testy A*: przypadki z pkt 2; determinizm wyniku przy remisach (stabilne
   tie-breaki po id/kolejności heksów).
3. Test integracyjny: buildLine z trasy A* nie jest no-opem na mapie v1
   (porównanie referencji stanu przed/po).
4. e2e: klik pustego heksa → katalog → budowa elektrowni; poprowadzenie linii
   do miasta → przyłączenie; obiekty widoczne na mapie.
5. Copy i konwencje jak w `plan/README.md`; jeden primary na ekran (w trybie
   trasowania primary jest zatwierdzenie trasy — commit tury pozostaje
   w panelu dyspozytora, który jest wtedy schowany, więc reguła zachowana).
6. Zasady wspólne z `plan/README.md`.
