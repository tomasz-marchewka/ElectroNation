# UI kit — ekran dyspozytora

Odtworzenie głównego ekranu gry ElectroNation z mocków `2a` (ciemny) i `2b` (jasny).
Jeden ekran, dwa motywy przełączane atrybutem `data-theme` na `<html>`.

## Co jest klikalne

| Akcja | Efekt |
|---|---|
| Klik w **pusty heks** | panel heksa: teren, wiatr, nasłonecznienie, katalog budowy z cenami przemnożonymi przez mnożnik terenu, koszt linii NN/SN/WN za heks |
| Klik w **heks z obiektem** | panel obiektu: rodzaj, stan, zajęte przyłącza, akcje (poprowadź linię, rozbuduj) |
| **Suwaki nastaw** | przeliczają plan pokrycia, straty (~2,9 %) i zapas; zapas mniejszy od pasma wiatru robi się żółty |
| **ŁADUJ / STOP / ODDAWAJ** | magazyn wchodzi do bilansu jako pokrycie albo jako obciążenie |
| **WŁ. / WYŁ.** na farmie | jedyne ręczne sterowanie OZE (01 §4.1) — farma wypada z prognozy i z bilansu |
| **ZATWIERDŹ TURĘ** | rozstrzygnięcie: wiatr wchodzi dolnym pasmem (280 MW), liczy się dostarczenie, niedobór, przychód 650 zł/MWh × 10,9 i kara 4 000 zł/MWh; wynik ląduje w pasku raportu, tura przechodzi dalej |
| **Oś doby** | skok do dowolnej z 8 tur |
| **CIEMNY / JASNY** (prawy dolny róg) | przełącznik motywu |

## Skąd liczby

Dokumenty projektowe gry: 01 §2.2 (8 tur po 3 h), §4.1 (przykład bilansu 1500 MW), §4.2 (typy linii),
§4.5 (kara), §5 (CAPEX-y i czasy budowy), §6 (taryfa), §8 (układ ekranu i panel heksa),
05 (miasto = gospodarstwa + firmy), 06 §8.6 (pasma prognozy).

## Uwaga implementacyjna

`DispatcherScreen.jsx` jest samodzielny (ładuje się przez Babel w przeglądarce), więc powtarza
znaczniki komponentów zamiast importować pliki z `components/`. Klasy CSS i tokeny są identyczne.
W kodzie produkcyjnym importuj komponenty z `components/` — TopBar, Panel, PanelSection,
SetpointSlider, SegmentedControl, TogglePill, Button, ForecastRow, BalanceSummary, ReportStrip,
HexMap, DayChart — i nie duplikuj tego pliku.
