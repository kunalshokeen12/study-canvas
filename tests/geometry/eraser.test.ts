import { describe, it, expect } from "vitest";
import { eraserHitsStroke, splitStroke } from "../../src/geometry/eraser.ts";
import { bboxOfPoints } from "../../src/model/types.ts";
import type { Point, Stroke } from "../../src/model/types.ts";

function mkStroke(points: Array<[number, number]>): Stroke {
  const pts: Point[] = points.map(([x, y], i) => ({ x, y, p: 1, t: i }));
  return { id: "s1", tool: "pen", color: "#000000", size: 2, points: pts, bbox: bboxOfPoints(pts) };
}

describe("eraserHitsStroke", () => {
  it("hits a point exactly on the line", () => {
    const s = mkStroke([[0, 0], [100, 0]]);
    expect(eraserHitsStroke(s, { x: 50, y: 0, r: 5 })).toBe(true);
  });

  it("hits near an endpoint", () => {
    const s = mkStroke([[0, 0], [100, 0]]);
    expect(eraserHitsStroke(s, { x: 100, y: 3, r: 5 })).toBe(true);
    expect(eraserHitsStroke(s, { x: 0, y: -4, r: 5 })).toBe(true);
  });

  it("misses when far away", () => {
    const s = mkStroke([[0, 0], [100, 0]]);
    expect(eraserHitsStroke(s, { x: 50, y: 50, r: 5 })).toBe(false);
  });

  it("catches a fast swipe that crosses the line between two eraser samples", () => {
    // eraser jumps from well above to well below the line in one step;
    // eraser radius alone at either end wouldn't touch the stroke, but the
    // swept segment crosses it.
    const s = mkStroke([[0, 0], [100, 0]]);
    const prev = { x: 50, y: -50 };
    const curr = { x: 50, y: 50 };
    expect(eraserHitsStroke(s, { x: curr.x, y: curr.y, r: 2 }, prev)).toBe(true);
  });

  it("does not hit when swept segment stays parallel and far away", () => {
    const s = mkStroke([[0, 0], [100, 0]]);
    const prev = { x: 50, y: 50 };
    const curr = { x: 60, y: 60 };
    expect(eraserHitsStroke(s, { x: curr.x, y: curr.y, r: 2 }, prev)).toBe(false);
  });
});

describe("splitStroke", () => {
  it("splits in the middle, dropping the erased middle segment", () => {
    const s = mkStroke([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]);
    const fragments = splitStroke(s, { x: 20, y: 0, r: 5 });
    // point at x=20 removed (within r=5 of center); x=10,x=30 might also be
    // within 5? distance from (20,0): |10-20|=10 > 5 keep, |30-20|=10 >5 keep
    expect(fragments.length).toBe(2);
    expect(fragments[0]!.points.map((p) => p.x)).toEqual([0, 10]);
    expect(fragments[1]!.points.map((p) => p.x)).toEqual([30, 40]);
  });

  it("splits at the start, dropping a single-point start fragment", () => {
    const s = mkStroke([[0, 0], [10, 0], [20, 0], [30, 0]]);
    const fragments = splitStroke(s, { x: 0, y: 0, r: 3 });
    // only point 0 removed -> remaining fragment [10,20,30]
    expect(fragments.length).toBe(1);
    expect(fragments[0]!.points.map((p) => p.x)).toEqual([10, 20, 30]);
  });

  it("splits at the end", () => {
    const s = mkStroke([[0, 0], [10, 0], [20, 0], [30, 0]]);
    const fragments = splitStroke(s, { x: 30, y: 0, r: 3 });
    expect(fragments.length).toBe(1);
    expect(fragments[0]!.points.map((p) => p.x)).toEqual([0, 10, 20]);
  });

  it("removes the whole stroke when eraser covers everything", () => {
    const s = mkStroke([[0, 0], [10, 0], [20, 0]]);
    const fragments = splitStroke(s, { x: 10, y: 0, r: 50 });
    expect(fragments.length).toBe(0);
  });

  it("drops fragments with fewer than 2 points", () => {
    const s = mkStroke([[0, 0], [10, 0], [50, 0], [60, 0]]);
    // erase around x=30, leaving [0,10] and [50,60] each with 2 points: fine
    const fragments = splitStroke(s, { x: 30, y: 0, r: 15 });
    expect(fragments.every((f) => f.points.length >= 2)).toBe(true);
  });
});
