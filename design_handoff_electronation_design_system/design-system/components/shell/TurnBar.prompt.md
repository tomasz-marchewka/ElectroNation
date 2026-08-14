Oś doby — 8 nazwanych bloków po 3 h, zawsze między mapą a wykresem doby.

```jsx
<TurnBar current={6} onSelect={(i) => goTo(i)} />
```

Nazwy pór doby są kanonem gry (NOC, PRZEDŚWIT, RANO, PRZEDPOŁUDNIE, POŁUDNIE, POPOŁUDNIE, SZCZYT WIECZORNY, PÓŹNY WIECZÓR) — nie skracaj ich inaczej niż w `DAY_TURNS`. Nigdy nie pokazuj 24 godzin: doba to 8 tur.
