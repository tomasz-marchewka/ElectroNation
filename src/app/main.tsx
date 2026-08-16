import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useGameStore } from "./store/gameStore";
import "./styles/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");
const root = createRoot(rootElement);

// The autosave is read before the first paint, so a continued session never
// flashes a fresh board. `hydrate` never rejects: with no save, no storage or a
// broken slot the store simply keeps the new game it was created with.
void useGameStore
  .getState()
  .hydrate()
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
