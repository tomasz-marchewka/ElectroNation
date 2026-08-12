import { newGame, resolveTurn, type GameState } from "../../src/engine";

export function runTurns(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = resolveTurn(current);
  return current;
}

export function playTurns(seed: number, turns: number): GameState {
  return runTurns(newGame(seed), turns);
}
