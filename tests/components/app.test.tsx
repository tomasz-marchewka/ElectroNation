import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "../../src/app/App";

test("app shell renders with the engine wired in", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "ElectroNation" })).toBeDefined();
  // Day length comes from the engine's astronomy module — proves the
  // engine-in-bundle import path works end to end.
  expect(screen.getByText(/16 h 44 min/)).toBeDefined();
});
