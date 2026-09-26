// IndexedDB persistence via `idb`. Debounced autosave + visibilitychange
// flush (Android kills background tabs without firing beforeunload).
import { openDB, type IDBPDatabase } from "idb";
import type { Notebook } from "../model/types.ts";

const DB_NAME = "study-canvas";
const DB_VERSION = 1;
const STORE_NOTEBOOKS = "notebooks";
const STORE_META = "meta";

export type StoredMeta = {
  key: string;
  lastOpenedNotebookId?: string;
  scrollPositions?: Record<string, number>; // notebookId -> scrollTop
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
          db.createObjectStore(STORE_NOTEBOOKS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveNotebook(notebook: Notebook): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NOTEBOOKS, notebook);
}

export async function loadNotebook(id: string): Promise<Notebook | undefined> {
  const db = await getDB();
  return db.get(STORE_NOTEBOOKS, id);
}

export async function listNotebooks(): Promise<Notebook[]> {
  const db = await getDB();
  return db.getAll(STORE_NOTEBOOKS);
}

export async function deleteNotebook(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NOTEBOOKS, id);
}

export async function getMeta(): Promise<StoredMeta> {
  const db = await getDB();
  const meta = await db.get(STORE_META, "app");
  return meta ?? { key: "app" };
}

export async function setMeta(patch: Partial<StoredMeta>): Promise<void> {
  const db = await getDB();
  const current = await getMeta();
  await db.put(STORE_META, { ...current, ...patch, key: "app" });
}

/** Debounced autosave: call `schedule()` on every change; call `flush()`
 * immediately on visibilitychange-to-hidden. */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Notebook | null = null;
  private delayMs: number;

  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flush();
      }
    });
  }

  schedule(notebook: Notebook): void {
    this.pending = notebook;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending) {
      const nb = this.pending;
      this.pending = null;
      void saveNotebook(nb);
    }
  }
}

/** Export/import escape hatch: serialize/deserialize a notebook as JSON. */
export function serializeNotebook(notebook: Notebook): string {
  return JSON.stringify(notebook);
}

export class ImportVersionError extends Error {}

export function deserializeNotebook(json: string): Notebook {
  const data = JSON.parse(json) as Notebook;
  if (data.version !== 1) {
    throw new ImportVersionError(
      `Unsupported notebook version: ${String((data as { version?: unknown }).version)}`
    );
  }
  return data;
}
