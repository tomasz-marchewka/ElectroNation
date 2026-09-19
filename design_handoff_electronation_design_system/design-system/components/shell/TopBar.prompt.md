Pasek górny ekranu dyspozytora — stały kontekst gry (kiedy jesteśmy, jaka pogoda, ile mamy pieniędzy). Zawsze jeden na ekran, zawsze na samej górze.

```jsx
<TopBar
  context="ROK 3 · LISTOPAD · DOBA ROBOCZA A"
  regime="niż atlantycki"
  kpis={[
    { label: "BUDŻET", value: "7,42 mld zł" },
    { label: "WYNIK DOBY", value: "+46,9 mln", tone: "ok" },
    { label: "PROGNOZY", value: "PODSTAWOWY · 24 H" },
  ]}
/>
```

Zasady: kontekst wersalikami, reżim pogodowy zawsze w kolorze `--en-info` (to jedyny akcent w pasku). Wynik doby na plusie `tone="ok"`, na minusie `tone="danger"`. Nie wkładaj tu akcji — pasek jest wyłącznie do czytania.
