import { describe, it, expect } from "vitest";
import { createNotebook, addStroke, growPageForStroke } from "../../src/model/notebook.ts";
import { serializeNotebook, deserializeNotebook, ImportVersionError } from "../../src/storage/db.ts";
import { bboxOfPoints, PAGE_HEIGHT_INITIAL } from "../../src/model/types.ts";
import type { Point, Stroke } from "../../src/model/types.ts";

function mkStroke(points: Array<[number, number]>): Stroke {
  const pts: Point[] = points.map(([x, y], i) => ({ x, y, p: 1, t: i }));
  return { id: crypto.randomUUID(), tool: "pen", color: "#000000", size: 2, points: pts, bbox: bboxOfPoints(pts) };
}

describe("notebook serialization round trip", () => {
  it("serialize -> deserialize gives a deep-equal notebook", () => {
    let nb = createNotebook("nb1", "MA2409 Probability");
    const page = nb.pages[0]!;
    const s = mkStroke([[1, 2], [3, 4], [5, 6]]);
    const updatedPage = addStroke(page, s);
    nb = { ...nb, pages: [updatedPage] };

    const json = serializeNotebook(nb);
    const back = deserializeNotebook(json);
    expect(back).toEqual(nb);
  });

  it("rejects unknown versions with a clear message", () => {
    const bad = JSON.stringify({ id: "x", title: "t", pages: [], updatedAt: 0, version: 2 });
    expect(() => deserializeNotebook(bad)).toThrow(ImportVersionError);
  });
});

describe("page growth", () => {
  it("grows in fixed steps when a stroke nears the bottom", () => {
    let nb = createNotebook("nb1", "t");
    let page = nb.pages[0]!;
    expect(page.height).toBe(PAGE_HEIGHT_INITIAL);

    const nearBottom = mkStroke([[10, PAGE_HEIGHT_INITIAL - 100], [10, PAGE_HEIGHT_INITIAL - 50]]);
    page = growPageForStroke(page, nearBottom);
    expect(page.height).toBeGreaterThan(PAGE_HEIGHT_INITIAL);
  });

  it("does not grow when writing far from the bottom", () => {
    let nb = createNotebook("nb1", "t");
    let page = nb.pages[0]!;
    const farFromBottom = mkStroke([[10, 10], [20, 20]]);
    page = growPageForStroke(page, farFromBottom);
    expect(page.height).toBe(PAGE_HEIGHT_INITIAL);
  });
});
