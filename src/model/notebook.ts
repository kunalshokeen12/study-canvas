// Pure functions over Notebook/Page/Stroke data. No DOM access here.
import {
  bboxOfPoints,
  PAGE_GROW_THRESHOLD,
  PAGE_HEIGHT_INITIAL,
  PAGE_HEIGHT_STEP,
  type Notebook,
  type Page,
  type Stroke,
} from "./types.ts";

export function createNotebook(id: string, title: string): Notebook {
  return {
    id,
    title,
    pages: [createPage(crypto.randomUUID())],
    updatedAt: Date.now(),
    version: 1,
  };
}

export function createPage(id: string): Page {
  return { id, strokes: [], height: PAGE_HEIGHT_INITIAL };
}

/** Returns a new Page with the stroke appended (does not mutate input). */
export function addStroke(page: Page, stroke: Stroke): Page {
  return { ...page, strokes: [...page.strokes, stroke] };
}

/** Returns a new Page with strokes matching the given ids removed. */
export function removeStrokes(page: Page, ids: readonly string[]): Page {
  const idSet = new Set(ids);
  return { ...page, strokes: page.strokes.filter((s) => !idSet.has(s.id)) };
}

/**
 * Replace a set of strokes with a new set (used for partial erase, which
 * removes originals and inserts split fragments). Preserves overall stroke
 * order by inserting replacements at the position of the first removed id.
 */
export function replaceStrokes(
  page: Page,
  removeIds: readonly string[],
  insert: readonly Stroke[]
): Page {
  const removeSet = new Set(removeIds);
  const result: Stroke[] = [];
  let inserted = false;
  for (const s of page.strokes) {
    if (removeSet.has(s.id)) {
      if (!inserted) {
        result.push(...insert);
        inserted = true;
      }
      continue;
    }
    result.push(s);
  }
  if (!inserted) result.push(...insert);
  return { ...page, strokes: result };
}

/**
 * Grow the page height in fixed steps if the stroke gets within
 * PAGE_GROW_THRESHOLD page-units of the bottom. Pure: returns a new Page
 * (or the same page if no growth needed).
 */
export function growPageForStroke(page: Page, stroke: Stroke): Page {
  let height = page.height;
  const bottom = stroke.bbox.maxY;
  while (bottom > height - PAGE_GROW_THRESHOLD) {
    height += PAGE_HEIGHT_STEP;
  }
  if (height === page.height) return page;
  return { ...page, height };
}

export function finalizeStroke(
  tool: Stroke["tool"],
  color: string,
  size: number,
  points: Stroke["points"]
): Stroke {
  return {
    id: crypto.randomUUID(),
    tool,
    color,
    size,
    points,
    bbox: bboxOfPoints(points),
  };
}

export function updateNotebookPage(notebook: Notebook, page: Page): Notebook {
  const pages = notebook.pages.map((p) => (p.id === page.id ? page : p));
  return { ...notebook, pages, updatedAt: Date.now() };
}

export function appendPage(notebook: Notebook): Notebook {
  return {
    ...notebook,
    pages: [...notebook.pages, createPage(crypto.randomUUID())],
    updatedAt: Date.now(),
  };
}
