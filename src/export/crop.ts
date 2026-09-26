// Render a page rect from VECTOR DATA (never read screen canvases) to a PNG
// Blob, for the "Ask Claude" tool.
import { PAGE_WIDTH, bboxExpanded, bboxIntersects, type BBox, type Page } from "../model/types.ts";
import { drawStrokes } from "../render/strokes.ts";

export const CROP_PADDING = 16; // page units
export const CROP_SCALE = 2;
export const CROP_MAX_DIMENSION = 2048; // px

export type CropResult = {
  canvasWidth: number;
  canvasHeight: number;
  scale: number; // effective px-per-page-unit used
  rect: BBox; // the padded rect, in page units, that was rendered
};

/**
 * Compute the final canvas size and effective scale for a given selection
 * rect, applying padding and clamping the longest side to CROP_MAX_DIMENSION.
 * Pure, no canvas involved — unit-testable in isolation.
 */
export function computeCropGeometry(rect: BBox, page: Page): CropResult {
  const padded: BBox = bboxExpanded(rect, CROP_PADDING);
  // clamp to page bounds (x: [0, PAGE_WIDTH], y: [0, page.height])
  const clamped: BBox = {
    minX: Math.max(0, padded.minX),
    minY: Math.max(0, padded.minY),
    maxX: Math.min(PAGE_WIDTH, padded.maxX),
    maxY: Math.min(page.height, padded.maxY),
  };
  const width = Math.max(1, clamped.maxX - clamped.minX);
  const height = Math.max(1, clamped.maxY - clamped.minY);

  let scale = CROP_SCALE;
  const longest = Math.max(width, height) * scale;
  if (longest > CROP_MAX_DIMENSION) {
    scale = CROP_MAX_DIMENSION / Math.max(width, height);
  }

  return {
    canvasWidth: Math.round(width * scale),
    canvasHeight: Math.round(height * scale),
    scale,
    rect: clamped,
  };
}

/**
 * Render the given page rect to an offscreen canvas from vector strokes.
 * Strokes are clipped to the rect (not dropped) if only partially inside.
 */
export function renderCropCanvas(page: Page, rect: BBox): HTMLCanvasElement {
  const geo = computeCropGeometry(rect, page);
  const canvas = document.createElement("canvas");
  canvas.width = geo.canvasWidth;
  canvas.height = geo.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Clip to the crop rect (in canvas pixel space this is the whole canvas,
  // but strokes are drawn in page space so we clip in page space before
  // transforming).
  ctx.scale(geo.scale, geo.scale);
  ctx.translate(-geo.rect.minX, -geo.rect.minY);

  ctx.beginPath();
  ctx.rect(geo.rect.minX, geo.rect.minY, geo.rect.maxX - geo.rect.minX, geo.rect.maxY - geo.rect.minY);
  ctx.clip();

  const relevant = page.strokes.filter((s) => bboxIntersects(s.bbox, geo.rect));
  drawStrokes(ctx, relevant);
  ctx.restore();

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}

export async function cropPageToPngFile(page: Page, rect: BBox): Promise<File> {
  const canvas = renderCropCanvas(page, rect);
  const blob = await canvasToPngBlob(canvas);
  return new File([blob], "question.png", { type: "image/png" });
}
