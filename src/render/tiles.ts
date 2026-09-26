// Tile management for a single page: split into vertical bands of
// TILE_HEIGHT page units, one canvas per tile, created/rendered lazily via
// IntersectionObserver, released when far off-screen.
import { PAGE_WIDTH, TILE_HEIGHT, bboxIntersects, type Page, type Stroke } from "../model/types.ts";
import { cappedDPR } from "../geometry/coords.ts";
import { drawStrokes } from "./strokes.ts";

export type Tile = {
  index: number; // 0-based, tile covers [index*TILE_HEIGHT, (index+1)*TILE_HEIGHT)
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
};

export class TileManager {
  private tiles = new Map<number, Tile>();
  private observer: IntersectionObserver;
  private container: HTMLElement;
  private zoom = 1;
  private dpr = cappedDPR(window.devicePixelRatio || 1);

  constructor(container: HTMLElement) {
    this.container = container;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset["tileIndex"]);
          const tile = this.tiles.get(idx);
          if (!tile) continue;
          if (entry.isIntersecting) {
            this.ensureRendered(idx);
          } else {
            // Release backing store memory but keep the placeholder element
            // (cheap) so IntersectionObserver keeps tracking it.
            tile.el.width = 0;
            tile.el.height = 0;
            tile.dirty = true;
          }
        }
      },
      { root: null, rootMargin: "800px 0px 800px 0px" }
    );
  }

  tileCountForHeight(pageHeight: number): number {
    return Math.ceil(pageHeight / TILE_HEIGHT);
  }

  /** Ensure tile placeholder elements exist for the given page height. */
  syncTileCount(pageHeight: number): void {
    const count = this.tileCountForHeight(pageHeight);
    for (let i = 0; i < count; i++) {
      if (!this.tiles.has(i)) this.createTile(i);
    }
  }

  private createTile(index: number): void {
    const el = document.createElement("canvas");
    el.className = "sc-tile";
    el.dataset["tileIndex"] = String(index);
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = `${index * TILE_HEIGHT * this.zoom}px`;
    el.style.width = `${PAGE_WIDTH * this.zoom}px`;
    el.style.height = `${TILE_HEIGHT * this.zoom}px`;
    const ctx = el.getContext("2d", { desynchronized: true });
    if (!ctx) throw new Error("2D context unavailable");
    this.container.appendChild(el);
    this.observer.observe(el);
    this.tiles.set(index, { index, el, ctx, dirty: true });
  }

  private ensureRendered(index: number): void {
    const tile = this.tiles.get(index);
    if (!tile) return;
    const w = Math.round(PAGE_WIDTH * this.zoom * this.dpr);
    const h = Math.round(TILE_HEIGHT * this.zoom * this.dpr);
    if (tile.el.width !== w || tile.el.height !== h) {
      tile.el.width = w;
      tile.el.height = h;
      tile.dirty = true;
    }
  }

  tileBBox(index: number) {
    return {
      minX: 0,
      minY: index * TILE_HEIGHT,
      maxX: PAGE_WIDTH,
      maxY: (index + 1) * TILE_HEIGHT,
    };
  }

  /** Redraw all tiles whose bbox intersects the stroke. */
  markDirtyForStroke(stroke: Stroke): void {
    for (const tile of this.tiles.values()) {
      if (bboxIntersects(this.tileBBox(tile.index), stroke.bbox)) {
        tile.dirty = true;
      }
    }
  }

  markAllDirty(): void {
    for (const tile of this.tiles.values()) tile.dirty = true;
  }

  /** Re-render any dirty, currently-sized (visible) tiles from the page's strokes. */
  renderDirty(page: Page): void {
    for (const tile of this.tiles.values()) {
      if (!tile.dirty) continue;
      if (tile.el.width === 0 || tile.el.height === 0) continue; // offscreen, skip
      this.renderTile(tile, page);
    }
  }

  private renderTile(tile: Tile, page: Page): void {
    const ctx = tile.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, tile.el.width, tile.el.height);
    ctx.scale(this.zoom * this.dpr, this.zoom * this.dpr);
    ctx.translate(0, -tile.index * TILE_HEIGHT);
    const tileBBox = this.tileBBox(tile.index);
    const relevant = page.strokes.filter((s) => bboxIntersects(s.bbox, tileBBox));
    drawStrokes(ctx, relevant);
    ctx.restore();
    tile.dirty = false;
  }

  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    for (const tile of this.tiles.values()) {
      tile.el.style.top = `${tile.index * TILE_HEIGHT * this.zoom}px`;
      tile.el.style.width = `${PAGE_WIDTH * this.zoom}px`;
      tile.el.style.height = `${TILE_HEIGHT * this.zoom}px`;
      tile.dirty = true;
      tile.el.width = 0;
      tile.el.height = 0;
    }
  }

  destroy(): void {
    this.observer.disconnect();
    for (const tile of this.tiles.values()) tile.el.remove();
    this.tiles.clear();
  }
}
