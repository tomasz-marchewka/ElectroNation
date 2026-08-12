import { test } from "vitest";

// doc 06 §12 tests 6–12 are statistical — verified on 20+ simulated years —
// and require the full weather model (doc 06 §6–§8). Each lands here together
// with the model layer it verifies (implementation order: doc 06 §13).

test.todo("§12.6: annual PV capacity factor = 11–12%");
test.todo("§12.7: annual onshore wind capacity factor = 24–30%");
test.todo("§12.8: annual offshore (Baltic) wind capacity factor = 45–50%");
test.todo("§12.9: PV energy December : June between 1:10 and 1:12");
test.todo("§12.10: mean wind speed January : July ≈ 1.43 : 1");
test.todo("§12.11: hours with v ≥ 25 m/s per year = 10–40 (storm cutouts)");
test.todo("§12.12: Dunkelflaute episodes (≥3 days) per year = 2–5");
