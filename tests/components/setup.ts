// Testing Library only auto-cleans up when Vitest globals are on; they are
// not, so every component test file unmounts through this shared hook.

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { setSaveStorage } from "../../src/app/save/autosave";
import { memoryStorage } from "../../src/app/save/storage";

// jsdom has no IndexedDB. A fresh in-memory slot per test lets the components
// exercise the real autosave path instead of its storage-denied branch.
beforeEach(() => setSaveStorage(memoryStorage()));

afterEach(cleanup);
