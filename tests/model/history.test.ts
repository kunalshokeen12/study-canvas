import { describe, it, expect } from "vitest";
import { History } from "../../src/model/history.ts";
import { createPage, addStroke } from "../../src/model/notebook.ts";
import { splitStroke } from "../../src/geometry/eraser.ts";
import { bboxOfPoints } from "../../src/model/types.ts";
import type { Page, Point, Stroke } from "../../src/model/types.ts";

function mkStroke(id: string, points: Array<[number, number]>): Stroke {
  const pts: Point[] = points.map(([x, y], i) => ({ x, y, p: 1, t: i }));
  return { id, tool: "pen", color: "#000000", size: 2, points: pts, bbox: bboxOfPoints(pts) };
}

describe("History undo/redo", () => {
  it("round-trips AddStroke", () => {
    const h = new History();
    let page = createPage("p1");
    const s = mkStroke("s1", [[0, 0], [10, 10]]);
    page = addStroke(page, s);
    h.push({ type: "add", stroke: s });

    expect(page.strokes.length).toBe(1);
    page = h.undo(page);
    expect(page.strokes.length).toBe(0);
    page = h.redo(page);
    expect(page.strokes.length).toBe(1);
    expect(page.strokes[0]).toEqual(s);
  });

  it("round-trips RemoveStrokes", () => {
    const h = new History();
    let page: Page = createPage("p1");
    const s1 = mkStroke("s1", [[0, 0], [10, 10]]);
    const s2 = mkStroke("s2", [[20, 20], [30, 30]]);
    page = { ...page, strokes: [s1, s2] };

    // simulate erasing s1
    page = { ...page, strokes: page.strokes.filter((s) => s.id !== "s1") };
    h.push({ type: "remove", strokes: [s1] });

    expect(page.strokes.map((s) => s.id)).toEqual(["s2"]);
    page = h.undo(page);
    expect(page.strokes.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    page = h.redo(page);
    expect(page.strokes.map((s) => s.id)).toEqual(["s2"]);
  });

  it("round-trips ReplaceStrokes (partial erase) and undo restores the EXACT original stroke", () => {
    const h = new History();
    const original = mkStroke("s1", [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]);
    let page: Page = { ...createPage("p1"), strokes: [original] };

    const fragments = splitStroke(original, { x: 20, y: 0, r: 5 });
    page = { ...page, strokes: fragments };
    h.push({ type: "replace", removed: [original], inserted: fragments });

    expect(page.strokes.length).toBe(fragments.length);

    page = h.undo(page);
    expect(page.strokes.length).toBe(1);
    expect(page.strokes[0]).toEqual(original); // deep equal to exact original

    page = h.redo(page);
    expect(page.strokes.map((s) => s.id).sort()).toEqual(fragments.map((s) => s.id).sort());
  });

  it("caps history length and drops oldest entries", () => {
    const h = new History();
    for (let i = 0; i < 250; i++) {
      h.push({ type: "add", stroke: mkStroke(`s${i}`, [[0, 0], [1, 1]]) });
    }
    let undoCount = 0;
    while (h.canUndo) {
      h.undo(createPage("p1"));
      undoCount++;
      if (undoCount > 500) break; // safety
    }
    expect(undoCount).toBe(200);
  });
});
