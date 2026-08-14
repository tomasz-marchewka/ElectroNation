# ElectroNation — design system

System projektowy interfejsu gry **ElectroNation** — turowego symulatora operatora systemu
elektroenergetycznego w fikcyjnym kraju. Gracz buduje elektrownie, farmy OZE, magazyny, stacje
i linie, przyłącza miasta i w każdej turze doby domyka bilans mocy pod niepewną prognozą pogody.

## Skąd to się wzięło

| Źródło | Co z niego pochodzi |
|---|---|
| `uploads/docs/01-mechanika-gry.md` (v0.14) | zakres funkcjonalny ekranu (§8), 8 tur po 3 h (§2.2), typy linii NN/SN/WN (§4.2), CAPEX-y i czasy budowy (§5), taryfa 650 zł/MWh i kara 4 000 zł/MWh (§4.5, §6), panel heksa (§8 pkt 6) |
| `uploads/docs/05-model-zapotrzebowania.md` (v0.2) | miasto = gospodarstwa domowe + firmy, profile dobowe, wzrost i kurczenie miast |
| `uploads/docs/06-model-astronomiczny-i-pogodowy.md` (v0.3) | reżimy pogodowe, produkcja PV i wiatru, model błędu prognozy (§8.6) — źródło zasady „prognoza to pasmo, nie liczba" |
| `uploads/docs/90-pomysly-na-przyszlosc.md` (v0.3) | mechaniki odłożone — czego w UI **nie ma** (częstotliwość, rezerwy, N-1, rynek) |
| `ElectroNation Warianty Stylu.dc.html` | mocki, z których wprost wynika ten system: wybrany kierunek **Dyspozytornia** w wersji ciemnej (`2a`) i jasnej (`2b`) |

Handoff wizualny wspominany w 01 §8 (`design_handoff_electronation_turn_ui/`) **nie został dostarczony** —
system powstał z dokumentów i zatwierdzonych mocków.

## Zasada nadrzędna

To jest **aparatura, nie aplikacja**. Ekran ma wyglądać jak pulpit dyspozytora ruchu: gęsty,
monospace, ostre krawędzie, zero ozdób. Każdy piksel koloru coś znaczy — kolor jest kodem stanu
(obciążenie, zapas, alarm) albo kodem technologii (węgiel, gaz, wiatr, PV, magazyn), nigdy dekoracją.

Trzy reguły, których nie wolno złamać:

1. **Prognoza jest pasmem.** Każda wielkość pogodowa i popytowa pokazywana graczowi ma szerokość
   (±), bo gra jest o zakładzie z niepewnością (06 §8.6.4). Pojedyncza liczba prognozy = błąd projektowy.
2. **Każdy heks ma teren.** Puste pole mapy to nie tło — to biom z mnożnikiem kosztu budowy.
   Obiekt nigdy nie zakrywa biomu (pierścień + podkładka pod ikoną).
   Linia przesyłowa jest **łamaną po środkach heksów trasy**, nie odcinkiem między obiektami;
   linie dzielące korytarz rozjeżdżają się równolegle o 9 px.
3. **Jedna akcja główna na ekran** — ZATWIERDŹ TURĘ. Reszta to ghosty. Po zatwierdzeniu nie ma odwrotu,
   więc gracz musi wiedzieć, gdzie jest ten jeden przycisk.

## CONTENT FUNDAMENTALS — jak pisać

- **Język: polski.** Terminologia branżowa bez tłumaczenia na potoczne: „nastawa", „bilans",
  „przepustowość", „energia niedostarczona", „przyłącze", „reżim pogodowy".
- **Etykiety wersalikami, mono**: `NASTAWY`, `BILANS PRZY OBECNYCH NASTAWACH`, `SZCZYT WIECZORNY`.
  Nazwy własne obiektów też wersalikami: `EW JARNOWO`, `FW GRZBIET`, `BESS POLANA`.
- **Technologia małymi literami** jako dopisek: `EW JARNOWO węgiel`, `EC DOLINA CCGT`.
- **Bezosobowo, w czasie teraźniejszym.** „wiatr wszedł 280 MW", „miasto kurczy się o połowę
  niedostarczonego udziału". Nigdy „Twoje miasto", nigdy „Świetna robota!".
- **Diagnoza zamiast ostrzeżenia.** Nie „Uwaga, ryzyko!", tylko `⚠ dolne pasmo wiatru = −60 MW →
  ryzyko niedoboru`. Komunikat zawsze mówi, **skąd** bierze się liczba.
- **Akcje to rozkaźnik ze strzałką**: `ZATWIERDŹ TURĘ ▸`, `POPROWADŹ LINIĘ STĄD`, `PRZEWIŃ ⏭`.
- **Liczby**: przecinek dziesiętny, spacja jako separator tysięcy (`4 000 zł/MWh`), waluta bez groszy,
  nastawa zawsze jako „wartość / maks." (`800 / 900`), pasmo zawsze z ± (`320 ±60`).
  Jednostki zawsze podane: MW, MWh, zł/MWh, m/s, %, h.
- **Znaki statusu**: ✓ (w normie), ⚠ (cienki zapas), ✕ (bilans nie domyka), ◂ ▸ ⏭ (kierunek, nawigacja),
  ⬡ (heks, w znaku gry). To cały dozwolony zestaw — **emoji nie używamy nigdzie**.
- **Bez wykrzykników, bez pytań retorycznych, bez metadyskursu.** Gra nie tłumaczy, dlaczego coś jest
  ważne; pokazuje liczbę i konsekwencję.

## VISUAL FOUNDATIONS

**Motywy.** Dwa równoprawne: ciemny (domyślny, `:root`) i jasny (`[data-theme="light"]`).
Ten sam układ, te same wymiary, te same znaczenia kolorów — zmieniają się tylko wartości.

**Kolor.** Tło chłodne, prawie bezbarwne (ciemny: #070b10 mapa → #0f151e panel; jasny: #e6ebf1 mapa
→ #f7f9fb panel). Akcenty tylko funkcyjne: zielony `--en-ok` (≤75 % obciążenia, zapas w normie),
żółty `--en-warn` (>75 %, cienki zapas, kolor akcji), czerwony `--en-danger` (limit, niedobór),
cyjan `--en-info` (pogoda i OZE). Technologie mają własne, stałe barwy — te same na wykresie doby,
na suwaku i na ikonie obiektu. Na ekranie nie ma żadnego koloru „bo ładnie".

**Typografia.** IBM Plex Mono do wszystkiego, co jest liczbą, etykietą, nazwą obiektu albo akcją;
IBM Plex Sans tylko do zdań dłuższych niż etykieta. Skala 9–19 px, gęsta, nigdy poniżej 9 px.
Nagłówki sekcji 10 px z letter-spacing 1,5 px; znak gry 2 px; przycisk główny 1 px.
Cyfry tabularne (`font-variant-numeric: tabular-nums`), żeby liczby nie skakały między turami.

**Kształt.** `--en-radius: 0` — zero promieni w całym UI. Zero cieni. Jedyny okrągły element to
kropka stanu i podkładka pod ikoną obiektu na mapie. Podział 1-px kreską w kolorze `--en-border`;
akcent to 2-px górna krawędź (pasek raportu). Zagłębienie zamiast karty: sekcja bilansu ma ciemniejsze tło.

**Tło i tekstury.** Brak zdjęć, brak gradientów dekoracyjnych. Jedyny gradient w systemie to warstwy
wykresu doby (twarde przejścia stopni, nie przenikanie). Faktura występuje wyłącznie na mapie:
każdy biom ma własny znak (trójkąty góry, choinki las, kreski bagno, fale woda, bloki miasto)
rysowany w kolorze `--en-biome-*-tex` z opacity 0,62.

**Layout.** Stała rama: pasek górny 52 px → mapa (elastyczna) + panel 400 px dokowany po prawej →
oś 8 tur → wykres doby → pasek raportu na całą szerokość. Panel dyspozytora jest **stale widoczny**;
nie ma zakładek ani zwijania. Panel heksa **zastępuje** panel dyspozytora w tej samej kolumnie.

**Animacja: nie ma.** Interfejs jest statyczny — stan czyta się z koloru i liczby, nie z ruchu.
Zostają wyłącznie natychmiastowe przejścia stanów kontrolek (`--en-dur-ui` 120 ms, `--en-ease-ui`).
Animowany przepływ energii po liniach i pulsujący pierścień miasta w niedoborze są **odłożone** —
wrócą razem z decyzją o widowiskowej fazie rozstrzygnięcia (01 §2.3). Nic nie wjeżdża, nic się nie odbija,
nic nie „faduje".

**Stany.** Hover: rozjaśnienie o 8 % (przycisk główny) albo podniesienie koloru tekstu i obrysu
(ghost, segment, kafel tury). Press: przygaszenie o 8 %. Focus: przejmujemy domyślny obrys przeglądarki —
gra jest sterowana myszą, ale panel musi zostać dostępny z klawiatury. Disabled: tło `--en-border`,
tekst `--en-text-4`, kursor `not-allowed`. Wybrane: obrys + tekst w `--en-ok` (segment)
albo tło `--en-action` (bieżąca tura).

**Przezroczystość i blur.** Blur nie występuje. Przezroczystość tylko na mapie: paski legend
(tło aplikacji, opacity 0,9), podkładka pod ikoną obiektu (0,78–0,82) i podświetlenie bieżącego bloku
na wykresie (0,07). Etykiety na mapie zamiast plakietek dostają halo: `paint-order: stroke`
obrysem w kolorze tła mapy, 3,5 px.

## ICONOGRAPHY

- **Brak zewnętrznego zestawu ikon.** Nie linkujemy Lucide, Heroicons ani font-ikon. Ikony obiektów
  gry są rysowane liniowo w SVG (stroke 2 px, bez wypełnień poza detalem) i mieszczą się w kole ⌀34 px
  na środku heksa: węgiel (komin), gaz (blok z płomieniem), wiatr (trójłopatowy wirnik), PV (panel
  z siatką), magazyn (bateria z ładunkiem), stacja (romb), miasto (sylweta 2–3 bloków), granica (≫).
  Podglądy: `guidelines/brand-objects.html`.
- **Zestaw jest zamknięty.** Nowy typ obiektu = nowa ikona liniowa w tej samej konwencji, nie ikona z biblioteki.
- **Znaki tekstowe** zastępują ikony w UI: ▸ ⏭ ◂ ⚠ ✓ ✕ ⬡. Nic więcej.
- **Emoji: nie.** W żadnym miejscu interfejsu ani w tekstach.
- **Logo: nie dostarczono.** Znak składamy typograficznie: ⬡ + ELECTRONATION w IBM Plex Mono 600,
  letter-spacing 2 px (`guidelines/brand-mark.html`). Nie rysujemy zastępczego logotypu.

## Indeks

| Plik / katalog | Zawartość |
|---|---|
| `styles.css` | jedyny punkt wejścia CSS — same importy |
| `tokens/` | `fonts.css` (IBM Plex z CDN), `colors.css` (oba motywy + biomy), `typography.css`, `layout.css`, `motion.css` |
| `css/` | `base.css` (reset, rama aplikacji), `components.css` (klasy `.en-*` wspólne dla React i kart) |
| `components/shell/` | TopBar, Panel, PanelSection, TurnBar (+ stała `DAY_TURNS`) |
| `components/controls/` | SetpointSlider, SegmentedControl, TogglePill, Button |
| `components/data/` | ForecastRow, BalanceSummary, ReportStrip, StatusDot |
| `components/map/` | HexMap (+ `BIOMES`, `hexCenter`), `sampleWorld.js` — przykładowy świat 21×11 |
| `components/chart/` | DayChart |
| `guidelines/` | 20 kart specyfikacji: kolory (oba motywy, stany, technologie, biomy), typografia, siatka, znak, kodowanie linii, ikony |
| `ui_kits/dispatcher/` | klikalny ekran dyspozytora: nastawy przeliczają bilans, klik w heks otwiera panel heksa, zatwierdzenie tury generuje raport; przełącznik motywu |
| `SKILL.md` | wejście dla agenta (Claude Code) |

## Świadome dodatki

- **HexPanel** (w UI kicie, nie jako komponent) — panel heksa z katalogiem budowy jest wymagany
  przez 01 §8 pkt 6, ale nie było go w mockach; złożony z istniejących primitywów, żeby pokazać
  drugi stan prawej kolumny.
- **StatusDot** — wydzielony z legendy mapy, bo te same trzy stopnie obciążenia wracają w wielu miejscach.

## Czego w tym systemie celowo NIE MA

Wskaźnika częstotliwości, rezerw, N-1, schematu jednokreskowego, rynku i ceny krańcowej —
to mechaniki odłożone (90 §1, §4, §5). Nie ma też wskaźnika 4 faz tury: tura ma jedno zatwierdzenie.
