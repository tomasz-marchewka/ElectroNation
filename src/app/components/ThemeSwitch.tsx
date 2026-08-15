// Theme switch of the reference build (ui_kits/dispatcher/index.html): two
// segments in the bottom-right corner. It sits outside the top bar on purpose
// — the top bar carries no actions (TopBar.prompt.md).

import { useEffect } from "react";
import { useThemeStore, type Theme } from "../store/themeStore";

const THEME_LABELS: Record<Theme, string> = { dark: "CIEMNY", light: "JASNY" };
const THEMES: readonly Theme[] = ["dark", "light"];

export function ThemeSwitch() {
  const theme = useThemeStore((store) => store.theme);
  const setTheme = useThemeStore((store) => store.setTheme);

  // Every token repaints off this attribute; nothing about the layout moves.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="en-themeswitch en-segmented">
      {THEMES.map((candidate) => (
        <button
          type="button"
          key={candidate}
          className="en-seg"
          aria-pressed={theme === candidate}
          onClick={() => setTheme(candidate)}
        >
          {THEME_LABELS[candidate]}
        </button>
      ))}
    </div>
  );
}
