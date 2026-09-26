// Eraser tool: drives stroke-eraser / partial-eraser gestures over a Page.
import { eraserHitsStroke, splitStroke, type Circle } from "../geometry/eraser.ts";
import type { Page, Stroke } from "../model/types.ts";
import type { Command } from "../model/history.ts";

export type EraserMode = "stroke" | "partial";

/**
 * One eraser gesture accumulates all strokes touched across the whole
 * down-to-up movement, so it can be committed as a single undo step.
 */
export class EraserGesture {
  private mode: EraserMode;
  private radius: number;
  private touchedStrokeIds = new Set<string>();
  private removedOriginals: Stroke[] = [];
  private insertedFragments: Stroke[] = [];
  private prevCenter: { x: number; y: number } | undefined;

  constructor(mode: EraserMode, radius: number) {
    this.mode = mode;
    this.radius = radius;
  }

  /** Process one eraser position against the current page state. Returns the
   * new page if anything changed, else the same page. */
  step(page: Page, center: { x: number; y: number }): Page {
    const circle: Circle = { x: center.x, y: center.y, r: this.radius };
    let next = page;
    let changed = false;
    const removeIds: string[] = [];
    const inserts: Stroke[] = [];

    for (const stroke of page.strokes) {
      if (this.touchedStrokeIds.has(stroke.id)) continue;
      if (!eraserHitsStroke(stroke, circle, this.prevCenter)) continue;

      this.touchedStrokeIds.add(stroke.id);
      changed = true;

      if (this.mode === "stroke") {
        removeIds.push(stroke.id);
        this.removedOriginals.push(stroke);
      } else {
        const fragments = splitStroke(stroke, circle);
        removeIds.push(stroke.id);
        inserts.push(...fragments);
        this.removedOriginals.push(stroke);
        this.insertedFragments.push(...fragments);
      }
    }

    if (changed) {
      const removeSet = new Set(removeIds);
      const kept = next.strokes.filter((s) => !removeSet.has(s.id));
      next = { ...next, strokes: [...kept, ...inserts] };
    }

    this.prevCenter = center;
    return next;
  }

  /** Finish the gesture: returns a single undo Command for everything erased,
   * or null if nothing was touched. */
  finish(): Command | null {
    if (this.removedOriginals.length === 0) return null;
    if (this.mode === "stroke") {
      return { type: "remove", strokes: this.removedOriginals };
    }
    return { type: "replace", removed: this.removedOriginals, inserted: this.insertedFragments };
  }
}
