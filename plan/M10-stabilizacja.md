# M10 — Stabilizacja: goldeny scenariuszowe, e2e, strojenie

**Warstwa:** całość. **Zależności:** M2–M9 (zamyka wersję v1).
**Przeczytaj najpierw:** `CLAUDE.md`, `plan/README.md`, docs 01 §12 (pytania
prototypowe), 02 §9, 06 §12, `tests/goldens/`, `tests/stats/doc06-statistical.test.ts`.

## Cel

Siatka antyregresyjna odpowiada realnej grze (nie pustemu przebiegowi), e2e pokrywa
pełną pętlę, a wnioski z rozegrania kilku lat trafiają do notatki strojeniowej dla
dokumentu 03. Ten kamień nie dodaje mechanik.

## Zakres

### 1. Goldeny realnych scenariuszy

Jedyny dzisiejszy golden to 2 doby bez akcji. Dodaj fixtures (seed + log akcji,
format z `tests/goldens/goldens.test.ts`) — każdy z opisem, co przygważdża:

1. **Rozbudowa portfela** (~1 rok gry): budowa węgla + wiatru + baterii, druga
   linia, przyłączenie 2 miast, rozbudowa elektrowni o blok — KPI pokazują wzrost
   przychodów i wpływ kosztów stałych.
2. **Dunkelflaute z magazynem**: seed dobrany tak, by trafić zimowy wyż (sprawdź
   `monthRegimes` dla kandydatów); portfel z dużym udziałem OZE + bateria +
   import — KPI pokazują pustoszenie magazynu i drogi ratunek importem.
3. **Sztorm**: seed z reżimem sztormowym; nadprodukcja wiatru, potem odcięcie
   przy 25 m/s (06 §6.3) — golden przygważdża oba efekty w KPI.
4. **Wąskie gardło**: „grube linie, cienka stacja" (02 §9 pkt 6) w realnej
   rozgrywce — niedobór mimo nadmiaru mocy; KPI per tura + ENS.
5. **Systemy prognostyczne**: zakup poziomu zaawansowanego w trakcie scenariusza
   (M3) — zwężenie pasm widoczne pośrednio w KPI (mniejsze kary przy tej samej
   strategii nastaw).

Loga akcji układaj ręcznie (czytaj prognozy przez API silnika w skrypcie
pomocniczym, jeśli trzeba) — golden ma być zrozumiały, nie wygenerowany na ślepo.

### 2. Test statystyczny Dunkelflaute (06 §12.12)

Domknij `test.todo` w `tests/stats/doc06-statistical.test.ts`. Zablokowany był na
mapowaniu epizodów wielodniowych na kalendarz 3 dób/miesiąc — przyjmij definicję:
epizod = kolejne doby gry (w obrębie miesiąca i przez granicę miesięcy) z reżimem
wyżu zimowego (mroźny/mglisty) i łączną produkcją wiatr+PV poniżej progu z 06 §12.12.
Zweryfikuj częstość epizodów ≥2 i ≥3 dób w pasmach z dokumentu na 100 latach
symulacji; jeśli dokument wymaga doprecyzowania definicji — zaproponuj poprawkę
sekcji 06 §12.12 użytkownikowi zamiast naginać test.

### 3. Rozszerzenie e2e

Jeden przepływ Playwright (Chromium, bez multiplikacji przeglądarek):
nowa gra → ustaw nastawy → rozstrzygnij turę → zbuduj obiekt z panelu heksa →
poprowadź linię → przewiń do końca doby → zapisz (przeładowanie strony) →
kontynuuj. Selektory stabilne (role/tekst PL), bez sleepów.

### 4. Sanity wydajności

- Rok gry (288 tur, mapa v1, portfel ~15 obiektów) w teście node'owym poniżej
  ustalonego budżetu czasu (zmierz, zapisz próg z zapasem ×3 — chodzi o wykrycie
  regresji O(n²), nie o benchmark).
- Render mapy v1 z pełnym obciążeniem raportu bez zauważalnego jank (profil ręczny,
  notatka z wyniku).

### 5. Notatka strojeniowa dla doc 03 (deliverable tekstowy)

Rozegraj (albo zasymuluj skryptem) 2–3 lata gry i spisz do `plan/notatka-strojenie.md`
odpowiedzi na pytania 01 §12: tempo tury, czy pasma prognozy wymuszają planowanie,
czytelność ograniczeń sieci, moment znużenia; do tego obserwacje ekonomiczne
(czy 10 mld domyka otwarcie — 01 §3.4, czy kara 400 zł/MWh zrzutu działa — 02 §5.2,
czy import take-or-pay nie jest zbyt brutalny — 02 §10). To wsad dla projektanta
do dokumentu 03 — **bez samowolnego strojenia wartości w kodzie**.

### 6. Poza zakresem

Zmiany balansu (czeka na doc 03), nowe mechaniki, optymalizacje bez zmierzonej
potrzeby.

## Kryteria akceptacji

1. ≥5 nowych goldenów z opisami; wszystkie zielone i przejrzane.
2. §12.12 zaimplementowany albo udokumentowana propozycja korekty dokumentu.
3. e2e pełnej pętli zielone w CI.
4. Testy wydajności z progami; wynik profilu mapy odnotowany.
5. `plan/notatka-strojenie.md` istnieje i odpowiada na pytania 01 §12.
6. Zasady wspólne z `plan/README.md`.
