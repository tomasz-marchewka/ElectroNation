Wykres doby — stale widoczny pod osią tur, nigdy zwijany.

```jsx
<DayChart
  truth={[30, 26, 24, 24, 26, 32, 43, 53, 57, 56, 56, 55, 54, 53, 54, 57, 67, 79, 85]}
  forecast={[{ lo: 80, hi: 90 }, { lo: 72, hi: 86 }, { lo: 60, hi: 78 }, { lo: 48, hi: 68 }]}
  nowRatio={0.75}
/>
```

Prawda jest linią ciągłą, prognoza kreskowana i zawsze z pasmem — pojedyncza linia prognozy jest w tej grze błędem projektowym (06 §8.6.4). Kreska TERAZ i podświetlenie bieżącego bloku zawsze w kolorze akcji.
