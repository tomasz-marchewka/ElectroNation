Bilans tury — ostatnia rzecz, którą gracz czyta przed zatwierdzeniem.

```jsx
<BalanceSummary
  rows={[
    { label: "ZAPOTRZEBOWANIE", value: "1500" },
    { label: "STRATY PRZESYŁU", value: "~45" },
    { label: "PLAN POKRYCIA", value: "1570" },
  ]}
  total="+25 MW (1,6%)"
  tone="warn"
  note="⚠ dolne pasmo wiatru = −60 MW → ryzyko niedoboru"
/>
```

Nota zawsze mówi, **skąd** bierze się ryzyko (dolne pasmo prognozy, limit linii, pusty magazyn) — nigdy „uważaj". Zapas dodatni ale mniejszy od pasma wiatru to `tone="warn"`.
