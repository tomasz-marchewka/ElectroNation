Mapa świata gry — heksy 25 km, biomy, linie przesyłowe, obiekty.

```jsx
const hexes = world.map((h) => ({ ...h, ...hexCenter(h.col, h.row) }));
<HexMap
  hexes={hexes}
  lines={[{ fromHex: [6, 6], toHex: [9, 6], type: "WN", load: "ok" }]}
  objects={[{ x: 340, y: 383.5, kind: "coal" }, { x: 748, y: 560.5, kind: "town", alert: true }]}
  labels={[{ x: 340, y: 432, text: "EW JARNOWO · 800/900" }]}
  overloadLabel={{ x: 712, y: 516, text: "NN 150/150 ⚠" }}
  onHexClick={(h) => openHexPanel(h)}
/>
```

Zasady nienaruszalne:
- **Każdy** heks ma biom — puste pole to nie tło, to teren z ceną budowy.
- Obiekt nigdy nie zakrywa biomu: pierścień + okrągła podkładka pod ikoną, teren widoczny w narożnikach heksa.
- Grubość linii = typ (NN/SN/WN), kolor = obciążenie. Nie mieszaj tych dwóch kodowań.
- **Linia to łamana po heksach**, nie odcinek: podaj `fromHex`/`toHex` w współrzędnych kolumna/rząd,
  a trasa przejdzie przez środek każdego heksa po drodze (tak liczy się długość, straty i czas budowy —
  1 heks = 25 km). Trasę zwraca `hexLine`, gotowe punkty w px — `routeLines`.
- **Wspólny korytarz = tory równoległe**: linie biegnące przez ten sam heks rozjeżdżają się o
  `CORRIDOR_SPACING` (9 px) prostopadle do kierunku, symetrycznie względem osi korytarza.
  Przez heks może biec do 9 linii jednego typu (01 §3.3) — przy 9 torach zajmują 72 px z ~59 px
  szerokości heksa, więc dla gęstych korytarzy zmniejsz odstęp albo agreguj wizualnie.
- Etykiety obiektów zawsze wyśrodkowane POD heksem, z halo (`paint-order: stroke`).
- Miasto w niedoborze: czerwony pierścień, grubość 3 px. Bez animacji — interfejs jest statyczny.
