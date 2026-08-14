Panel dyspozytora — prawa kolumna ekranu gry. Trzyma prognozę, nastawy i bilans; nigdy nie jest zwijany ani zakładkowany.

```jsx
<Panel meta="TURA 7/8 · LISTOPAD · ×10,9 DNIA" title="SZCZYT WIECZORNY" hours="18–21">
  <PanelSection label="PROGNOZA · TURA 7">…</PanelSection>
  <PanelSection label="NASTAWY" grow>…</PanelSection>
  <PanelSection sunk>…</PanelSection>
</Panel>
```

Kolejność sekcji jest kanonem: prognoza → nastawy → bilans i akcja. Sekcja z bilansem zawsze `sunk` (ciemniejsza) i zawsze na dole — tam gracz kończy turę.
