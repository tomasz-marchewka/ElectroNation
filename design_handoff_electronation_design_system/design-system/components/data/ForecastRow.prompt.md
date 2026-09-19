Wiersz prognozy w sekcji PROGNOZA panelu dyspozytora.

```jsx
<div className="en-stack">
  <ForecastRow label="POPYT" value={1500} band={33} max={2000} />
  <ForecastRow label="WIATR" value={320} band={60} max={2000} color="var(--en-wind)" />
  <ForecastRow label="PV" value={0} note="0 · NOC" max={2000} />
</div>
```

Wszystkie wiersze w sekcji dzielą tę samą skalę `max` — inaczej szerokość pasma kłamie. Pasmo wiatru musi być wizualnie wyraźnie szersze od pasma popytu; to cała lekcja tego ekranu.
