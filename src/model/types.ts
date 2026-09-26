// Core data model. Source of truth is vector data, never pixels.
// All coordinates stored here are "page units" (independent of screen size,
// zoom, and devicePixelRatio). Screen<->page conversion happens at input time.

export type Point = { x: number; y: number; p: number; t: number }; // page coords, pressure 0..1, ms

export type Tool = "pen" | "highlighter";

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export type Stroke = {
  id: string; // crypto.randomUUID()
  tool: Tool;
  color: string; // '#RRGGBB'
  size: number; // base width in page units
  points: Point[];
  bbox: BBox; // cached, for hit tests + culling
};

export type Page = {
  id: string;
  strokes: Stroke[];
  height: number; // width is fixed (PAGE_WIDTH)
};

export type Notebook = {
  id: string;
  title: string;
  pages: Page[];
  updatedAt: number;
  version: 1;
};

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT_INITIAL = 1414; // A4 ratio
export const PAGE_HEIGHT_STEP = 1000;
export const PAGE_GROW_THRESHOLD = 300; // grow when writing within this of bottom

export const TILE_HEIGHT = 1024; // page units per tile

export const ERASER_SIZES = { small: 10, medium: 25, large: 60 } as const;
export const PEN_SIZES = { thin: 2, medium: 4, thick: 8 } as const;
export const HIGHLIGHTER_SIZE = 20;
export const HIGHLIGHTER_COLOR = "#FFE600";
export const HIGHLIGHTER_ALPHA = 0.35;

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function bboxOfPoints(points: Point[]): BBox {
  const b = emptyBBox();
  for (const pt of points) {
    if (pt.x < b.minX) b.minX = pt.x;
    if (pt.y < b.minY) b.minY = pt.y;
    if (pt.x > b.maxX) b.maxX = pt.x;
    if (pt.y > b.maxY) b.maxY = pt.y;
  }
  return b;
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxIntersects(a: BBox, b: BBox, pad = 0): boolean {
  return (
    a.minX - pad <= b.maxX &&
    a.maxX + pad >= b.minX &&
    a.minY - pad <= b.maxY &&
    a.maxY + pad >= b.minY
  );
}

export function bboxExpanded(b: BBox, amount: number): BBox {
  return {
    minX: b.minX - amount,
    minY: b.minY - amount,
    maxX: b.maxX + amount,
    maxY: b.maxY + amount,
  };
}
