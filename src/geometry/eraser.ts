// Pure eraser logic: full-stroke erase and partial (point-splitting) erase.
import { bboxExpanded, bboxIntersects, bboxOfPoints, type Point, type Stroke } from "../model/types.ts";
import { distToSegment, segmentToSegmentDist } from "./hit.ts";

export type Circle = { x: number; y: number; r: number };

/**
 * True if the eraser circle (optionally swept from prevCenter to center)
 * touches any segment of the stroke. Used for the default "stroke eraser"
 * mode: touching a stroke anywhere removes the whole stroke.
 */
export function eraserHitsStroke(
  stroke: Stroke,
  circle: Circle,
  prevCenter?: { x: number; y: number }
): boolean {
  const pad = circle.r;
  const eraserBBox = prevCenter
    ? bboxOfPoints([
        { x: prevCenter.x, y: prevCenter.y, p: 1, t: 0 },
        { x: circle.x, y: circle.y, p: 1, t: 0 },
      ])
    : bboxOfPoints([{ x: circle.x, y: circle.y, p: 1, t: 0 }]);

  if (!bboxIntersects(bboxExpanded(eraserBBox, pad), stroke.bbox)) {
    return false;
  }

  const pts = stroke.points;
  if (pts.length === 1) {
    const p0 = pts[0]!;
    return Math.hypot(p0.x - circle.x, p0.y - circle.y) <= circle.r;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (prevCenter) {
      // test the eraser's own movement segment against this stroke segment
      const d = segmentToSegmentDist(a, b, prevCenter, circle);
      if (d <= circle.r) return true;
    } else {
      const d = distToSegment(circle, a, b);
      if (d <= circle.r) return true;
    }
  }
  return false;
}

/**
 * Partial erase: remove any points of the stroke within the eraser circle,
 * splitting the stroke into fragments at the gaps. Fragments with fewer than
 * 2 points are dropped. Pure, returns a new array of Strokes (possibly empty,
 * possibly the same length as input if nothing was removed... but callers
 * should only invoke this when eraserHitsStroke is true).
 */
export function splitStroke(stroke: Stroke, circle: Circle): Stroke[] {
  const pts = stroke.points;
  const keepMask: boolean[] = pts.map((pt) => Math.hypot(pt.x - circle.x, pt.y - circle.y) > circle.r);

  const groups: Point[][] = [];
  let current: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (keepMask[i]) {
      current.push(pts[i]!);
    } else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  const result: Stroke[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    result.push({
      id: crypto.randomUUID(),
      tool: stroke.tool,
      color: stroke.color,
      size: stroke.size,
      points: group,
      bbox: bboxOfPoints(group),
    });
  }
  return result;
}
