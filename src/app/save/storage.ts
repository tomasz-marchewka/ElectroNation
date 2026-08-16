// Where the autosave physically lives. One slot, three methods — enough for
// IndexedDB in the browser and for an in-memory double in tests, and small
// enough that swapping the backing store later (a server, the file system)
// touches nothing above this file.

import { del, get, set, createStore, type UseStore } from "idb-keyval";

export interface SaveStorage {
  /** `undefined` when the slot is empty. */
  read(): Promise<unknown>;
  write(value: unknown): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "electronation";
const STORE_NAME = "saves";

/** Single autosave slot (M9 brief: no save slots in v1). */
export const AUTOSAVE_KEY = "autosave";

let cached: UseStore | null = null;

/** Opened on first use — importing this module must not require a browser. */
function idbStore(): UseStore {
  cached ??= createStore(DB_NAME, STORE_NAME);
  return cached;
}

export const indexedDbStorage: SaveStorage = {
  read: () => get(AUTOSAVE_KEY, idbStore()),
  write: (value) => set(AUTOSAVE_KEY, value, idbStore()),
  clear: () => del(AUTOSAVE_KEY, idbStore()),
};

/** In-memory double for tests and for any host without IndexedDB. */
export function memoryStorage(initial?: unknown): SaveStorage {
  let slot = initial;
  return {
    read: () => Promise.resolve(slot),
    write: (value) => {
      slot = value;
      return Promise.resolve();
    },
    clear: () => {
      slot = undefined;
      return Promise.resolve();
    },
  };
}
