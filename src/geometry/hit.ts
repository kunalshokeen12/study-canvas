// Pure geometry helpers: distance, bbox tests, rect containment.
import type { BBox } from "../model/types.ts";

export type Vec2 = { x: number; y: number };

/** Shortest distance from point p to segment ab. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Shortest distance between two segments ab and cd. */
export function segmentToSegmentDist(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    distToSegment(a, c, d),
    distToSegment(b, c, d),
    distToSegment(c, a, b),
    distToSegment(d, a, b)
  );
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(c, a, d)) return true;
  if (d2 === 0 && onSegment(c, b, d)) return true;
  if (d3 === 0 && onSegment(a, c, b)) return true;
  if (d4 === 0 && onSegment(a, d, b)) return true;
  return false;
}

export function bboxContainsPoint(b: BBox, p: Vec2): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function rectContainsBBox(rect: BBox, b: BBox): boolean {
  return (
    b.minX >= rect.minX &&
    b.maxX <= rect.maxX &&
    b.minY >= rect.minY &&
    b.maxY <= rect.maxY
  );
}

export function normalizeRect(a: Vec2, b: Vec2): BBox {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}
