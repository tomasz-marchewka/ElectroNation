// Testing Library only auto-cleans up when Vitest globals are on; they are
// not, so every component test file unmounts through this shared hook.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
