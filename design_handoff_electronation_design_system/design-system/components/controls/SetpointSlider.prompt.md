Nastawa mocy jednostki sterowalnej w sekcji NASTAWY panelu dyspozytora.

```jsx
<SetpointSlider name="EW JARNOWO" tech="węgiel" value={800} max={900}
  note="250 zł/MWh" color="var(--en-coal-ico)" onChange={setCoal} />
```

Jednostka wyłączona (value = 0) idzie w `--en-text-4` — gracz ma widzieć, że ma tam zapas. Kolejność jednostek w panelu: od najtańszej do najdroższej (merit order jako nauka). OZE nie dostaje suwaka — tylko `TogglePill` (01 §4.1).
