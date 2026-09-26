// Pen tool: builds a Stroke from pointer input using resolvePressure.
import { finalizeStroke } from "../model/notebook.ts";
import type { Point, Stroke } from "../model/types.ts";

export class PenGesture {
  private tool: Stroke["tool"];
  private color: string;
  private size: number;
  private points: Point[] = [];
  constructor(tool: Stroke["tool"], color: string, size: number) {
    this.tool = tool;
    this.color = color;
    this.size = size;
  }

  addPoint(pt: Point): void {
    this.points.push(pt);
  }

  get liveStroke(): Stroke {
    return {
      id: "live",
      tool: this.tool,
      color: this.color,
      size: this.size,
      points: this.points,
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  finish(): Stroke | null {
    if (this.points.length < 2) return null;
    return finalizeStroke(this.tool, this.color, this.size, this.points);
  }
}
