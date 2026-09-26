// Turn a Stroke into a filled Path2D using perfect-freehand, and draw it to
// a 2D context that has already been transformed to page-unit space.
import getStroke from "perfect-freehand";
import { HIGHLIGHTER_ALPHA } from "../model/types.ts";
import type { Stroke } from "../model/types.ts";

function strokeToPath2D(stroke: Stroke): Path2D {
  const isHighlighter = stroke.tool === "highlighter";
  const inputPoints = stroke.points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
  const outline = getStroke(inputPoints, {
    size: stroke.size,
    thinning: isHighlighter ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
  });

  const path = new Path2D();
  if (outline.length === 0) return path;
  const first = outline[0]!;
  path.moveTo(first[0]!, first[1]!);
  for (let i = 1; i < outline.length; i++) {
    const pt = outline[i]!;
    path.lineTo(pt[0]!, pt[1]!);
  }
  path.closePath();
  return path;
}

/** Draw a single stroke into a context already transformed to page space. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const path = strokeToPath2D(stroke);
  ctx.save();
  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = "multiply";
  } else {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
}

/** Draw a list of strokes, highlighter first so ink stays crisp on top. */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[]): void {
  const highlighters = strokes.filter((s) => s.tool === "highlighter");
  const pens = strokes.filter((s) => s.tool !== "highlighter");
  for (const s of highlighters) drawStroke(ctx, s);
  for (const s of pens) drawStroke(ctx, s);
}
