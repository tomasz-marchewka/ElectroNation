Przyciski akcji tury.

```jsx
<div style={{ display: "flex", gap: 8 }}>
  <Button block onClick={commit}>ZATWIERDŹ TURĘ ▸</Button>
  <Button variant="ghost" onClick={fastForward}>PRZEWIŃ ⏭</Button>
</div>
```

Etykieta akcji głównej jest czasownikiem w trybie rozkazującym, wersalikami, ze strzałką ▸ na końcu. Nie dodawaj drugiego przycisku primary — po zatwierdzeniu tury nie ma odwrotu, więc gracz musi wiedzieć, gdzie jest ten jeden.
