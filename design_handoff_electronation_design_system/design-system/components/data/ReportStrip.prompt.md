Raport tury — pasek na całą szerokość pod mapą, widoczny po zatwierdzeniu.

```jsx
<ReportStrip tiles={[
  { label: "WIATR WSZEDŁ", value: "280 MW", note: "dolne pasmo (prog. 320)", tone: "info" },
  { label: "DOSTARCZONO", value: "1485 / 1500", note: "straty 43 MW" },
  { label: "NIEDOBÓR", value: "15 MW · KRASNÓW", note: "45 MWh niedostarczone", tone: "danger" },
  { label: "WYNIK TURY", value: "+17,6 mln zł", tone: "ok", highlight: true },
]} />
```

Kolejność kafli opowiada przyczynę i skutek: pogoda → dostarczenie → niedobór → pieniądze → wynik. Zawsze podawaj notę przy niedoborze i karze — gracz ma wiedzieć, o ile się pomylił, nie tylko że przegrał.
