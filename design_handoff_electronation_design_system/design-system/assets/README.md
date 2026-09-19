# assets

**Katalog jest celowo pusty.** Źródła (dokumenty projektowe gry) nie zawierały żadnych plików
graficznych: logo, ilustracji, zdjęć ani fontów.

- **Logo** — nie istnieje. Znak składamy typograficznie: ⬡ + ELECTRONATION (IBM Plex Mono 600,
  letter-spacing 2 px). Nie rysujemy zastępczego logotypu ani godła.
- **Ikony** — rysowane liniowo w SVG wewnątrz komponentu mapy (`components/map/HexMap.jsx`).
  Nie ma zestawu zewnętrznego ani sprite'u.
- **Fonty** — IBM Plex Sans / IBM Plex Mono ładowane z Google Fonts CDN
  (`tokens/fonts.css`). Do wydania offline trzeba wrzucić pliki woff2 tutaj i dopisać `@font-face`.

Gdy pojawi się logo gry, wrzuć je tu jako SVG i podmień znak w `components/shell/TopBar.jsx`.
