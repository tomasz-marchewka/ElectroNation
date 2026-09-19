Tryb pracy magazynu energii — trzy stany, nie suwak.

```jsx
<SegmentedControl options={["ŁADUJ", "STOP", "ODDAWAJ"]} value="ODDAWAJ"
  onChange={setMode} ariaLabel="Tryb magazynu" />
```

Etykiety wersalikami, 9 px. Używaj tylko tam, gdzie stany są rozłączne i są 2–3. Cztery opcje = zły komponent.
