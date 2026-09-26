import "./styles.css";
import {
  PAGE_WIDTH,
  HIGHLIGHTER_COLOR,
  HIGHLIGHTER_SIZE,
  PEN_SIZES,
  type Notebook,
  type Page,
  type Point,
  type Stroke,
} from "./model/types.ts";
import { createNotebook, growPageForStroke, appendPage } from "./model/notebook.ts";
import { History, type Command } from "./model/history.ts";
import { TileManager } from "./render/tiles.ts";
import { drawStroke } from "./render/strokes.ts";
import { screenToPage, cappedDPR, type Viewport } from "./geometry/coords.ts";
import { normalizeRect } from "./geometry/hit.ts";
import { PointerRouter, resolvePressure, isBarrelButtonHeld, getCoalesced } from "./input/pointer.ts";
import { PenGesture } from "./tools/pen.ts";
import { EraserGesture, type EraserMode } from "./tools/eraser.ts";
import { createToolbar, type ActiveTool } from "./ui/toolbar.ts";
import { openAskPanel } from "./ui/ask-panel.ts";
import { cropPageToPngFile } from "./export/crop.ts";
import { Autosaver, getMeta, loadNotebook, saveNotebook, setMeta } from "./storage/db.ts";

const DEFAULT_NOTEBOOK_ID = "default";

const appEl = document.querySelector<HTMLDivElement>("#app")!;
appEl.innerHTML = "";

const toolbarEl = document.createElement("div");
const scrollEl = document.createElement("div");
scrollEl.className = "sc-scroll-container";
appEl.append(toolbarEl, scrollEl);

let notebook: Notebook = createNotebook(DEFAULT_NOTEBOOK_ID, "Untitled notebook");
const historyByPage = new Map<string, History>();
const autosaver = new Autosaver(1000);

type PageView = {
  page: Page;
  root: HTMLDivElement;
  tiles: TileManager;
  liveCanvas: HTMLCanvasElement;
  liveCtx: CanvasRenderingContext2D;
};

const pageViews = new Map<string, PageView>();

let state = {
  tool: "pen" as ActiveTool,
  penSize: PEN_SIZES.medium as number,
  penColor: "#000000",
  eraserSize: 25 as number,
};

let currentGesture: PenGesture | null = null;
let currentEraserGesture: EraserGesture | null = null;
let activePageId: string | null = null;
let askStart: Point | null = null;
let askOverlayEl: HTMLDivElement | null = null;
let anyPenActive = false;

const toolbarApi = createToolbar(toolbarEl, {
  onToolChange: (t) => {
    state.tool = t;
    toolbarApi.setActiveTool(t);
  },
  onPenSizeChange: (s) => (state.penSize = s),
  onPenColorChange: (c) => (state.penColor = c),
  onEraserSizeChange: (s) => (state.eraserSize = s),
  onUndo: () => undo(),
  onRedo: () => redo(),
  onAddPage: () => {
    notebook = appendPage(notebook);
    renderNotebookStructure();
    persist();
  },
});
toolbarApi.setActiveTool(state.tool);

function getHistory(pageId: string): History {
  let h = historyByPage.get(pageId);
  if (!h) {
    h = new History();
    historyByPage.set(pageId, h);
  }
  return h;
}

function persist(): void {
  notebook = { ...notebook, updatedAt: Date.now() };
  autosaver.schedule(notebook);
}

function updatePage(pageId: string, updater: (p: Page) => Page): void {
  const view = pageViews.get(pageId);
  if (!view) return;
  const updated = updater(view.page);
  view.page = updated;
  notebook = { ...notebook, pages: notebook.pages.map((p) => (p.id === pageId ? updated : p)) };
  view.tiles.syncTileCount(updated.height);
  applyPageHeight(view);
  persist();
}

function applyPageHeight(view: PageView): void {
  view.root.style.height = `${view.page.height}px`;
  view.liveCanvas.style.height = `${view.page.height}px`;
  const dpr = cappedDPR(window.devicePixelRatio || 1);
  const w = Math.round(PAGE_WIDTH * dpr);
  const h = Math.round(view.page.height * dpr);
  if (view.liveCanvas.width !== w || view.liveCanvas.height !== h) {
    view.liveCanvas.width = w;
    view.liveCanvas.height = h;
  }
}

function renderNotebookStructure(): void {
  // remove views for pages no longer present
  for (const [id, view] of pageViews) {
    if (!notebook.pages.some((p) => p.id === id)) {
      view.tiles.destroy();
      view.root.remove();
      pageViews.delete(id);
      historyByPage.delete(id);
    }
  }

  for (const page of notebook.pages) {
    let view = pageViews.get(page.id);
    if (!view) {
      view = createPageView(page);
      pageViews.set(page.id, view);
      scrollEl.appendChild(view.root);
    } else {
      view.page = page;
    }
    view.tiles.syncTileCount(page.height);
    applyPageHeight(view);
    view.tiles.markAllDirty();
    view.tiles.renderDirty(view.page);
  }
}

function createPageView(page: Page): PageView {
  const root = document.createElement("div");
  root.className = "sc-page";
  root.style.width = `${PAGE_WIDTH}px`;
  root.dataset["pageId"] = page.id;

  const liveCanvas = document.createElement("canvas");
  liveCanvas.className = "sc-live-layer";
  liveCanvas.style.width = `${PAGE_WIDTH}px`;
  const liveCtx = liveCanvas.getContext("2d", { desynchronized: true });
  if (!liveCtx) throw new Error("2D context unavailable");

  const inputLayer = document.createElement("div");
  inputLayer.className = "sc-input-layer";

  const tiles = new TileManager(root);
  root.append(liveCanvas, inputLayer);

  const view: PageView = { page, root, tiles, liveCanvas, liveCtx };

  wireInput(view, inputLayer);
  return view;
}

function getViewport(view: PageView): Viewport {
  const rect = view.root.getBoundingClientRect();
  return {
    scrollTop: 0,
    scrollLeft: 0,
    zoom: rect.width / PAGE_WIDTH,
    containerLeft: rect.left,
    containerTop: rect.top,
  };
}

function toPagePoint(e: PointerEvent, view: PageView): Point {
  const vp = getViewport(view);
  const pt = screenToPage({ x: e.clientX, y: e.clientY }, vp);
  return { x: pt.x, y: pt.y, p: resolvePressure(e), t: e.timeStamp };
}

// getStroke() (perfect-freehand) recomputes the FULL outline from scratch
// on every call. Doing that once per pointermove is fine at first but gets
// slower as a stroke grows, and can fall behind the tablet's input rate
// (Chrome then queues events and only paints once the backlog drains at
// pointerup -- i.e. "ink only appears when you stop writing"). Coalesce to
// one recompute per animation frame instead of one per input event.
let liveRafHandle: number | null = null;
let pendingLiveDraw: { view: PageView; stroke: Stroke | null } | null = null;

function redrawLive(view: PageView, stroke: Stroke | null): void {
  pendingLiveDraw = { view, stroke };
  if (liveRafHandle !== null) return;
  liveRafHandle = requestAnimationFrame(() => {
    liveRafHandle = null;
    const pending = pendingLiveDraw;
    pendingLiveDraw = null;
    if (!pending) return;
    paintLive(pending.view, pending.stroke);
  });
}

function paintLive(view: PageView, stroke: Stroke | null): void {
  const dpr = cappedDPR(window.devicePixelRatio || 1);
  const zoom = getViewport(view).zoom || 1;
  const ctx = view.liveCtx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.liveCanvas.width, view.liveCanvas.height);
  if (stroke) {
    ctx.scale(zoom * dpr, zoom * dpr);
    drawStroke(ctx, stroke);
  }
  ctx.restore();
}

function drawEraserCursor(view: PageView, center: Point | null, radius: number): void {
  const dpr = cappedDPR(window.devicePixelRatio || 1);
  const zoom = getViewport(view).zoom || 1;
  const ctx = view.liveCtx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.liveCanvas.width, view.liveCanvas.height);
  if (center) {
    ctx.scale(zoom * dpr, zoom * dpr);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1 / (zoom * dpr);
    ctx.stroke();
  }
  ctx.restore();
}

function wireInput(view: PageView, inputLayer: HTMLElement): void {
  const router = new PointerRouter({
    onPenActiveChange: (active) => {
      view.root.classList.toggle("sc-pen-active", active);
      anyPenActive = active;
    },
    onDrawStart: (e) => onDrawStart(e, view),
    onDrawMove: (e) => onDrawMove(e, view),
    onDrawEnd: (e) => onDrawEnd(e, view),
  });

  inputLayer.addEventListener("pointerdown", (e) => {
    activePageId = view.page.id;
    router.handlePointerDown(e, inputLayer);
  });
  inputLayer.addEventListener("pointermove", (e) => {
    router.handlePointerMove(e);
  });
  inputLayer.addEventListener("pointerup", (e) => {
    router.handlePointerUp(e);
  });
  inputLayer.addEventListener("pointercancel", (e) => {
    router.handlePointerCancel(e);
  });
  inputLayer.addEventListener("pointerleave", (e) => {
    router.handlePointerLeave(e);
  });
  inputLayer.addEventListener("contextmenu", (e) => e.preventDefault());
}

function currentToolIsEraser(): EraserMode | null {
  if (state.tool === "eraser-stroke") return "stroke";
  if (state.tool === "eraser-partial") return "partial";
  return null;
}

function onDrawStart(e: PointerEvent, view: PageView): void {
  const pt = toPagePoint(e, view);

  if (state.tool === "ask") {
    askStart = pt;
    startAskOverlay(view);
    return;
  }

  const eraserMode = isBarrelButtonHeld(e) ? "stroke" : currentToolIsEraser();
  if (eraserMode) {
    currentEraserGesture = new EraserGesture(eraserMode, state.eraserSize / 2);
    applyEraserStep(view, pt);
    return;
  }

  const tool = state.tool === "highlighter" ? "highlighter" : "pen";
  const color = tool === "highlighter" ? HIGHLIGHTER_COLOR : state.penColor;
  const size = tool === "highlighter" ? HIGHLIGHTER_SIZE : state.penSize;
  currentGesture = new PenGesture(tool, color, size);
  currentGesture.addPoint(pt);
  redrawLive(view, currentGesture.liveStroke);
}

function onDrawMove(e: PointerEvent, view: PageView): void {
  if (state.tool === "ask" && askStart) {
    const pt = toPagePoint(e, view);
    updateAskOverlay(view, askStart, pt);
    return;
  }

  if (currentEraserGesture) {
    for (const ev of getCoalesced(e)) {
      const pt = toPagePoint(ev, view);
      applyEraserStep(view, pt);
    }
    return;
  }

  if (currentGesture) {
    for (const ev of getCoalesced(e)) {
      currentGesture.addPoint(toPagePoint(ev, view));
    }
    redrawLive(view, currentGesture.liveStroke);
  }
}

function onDrawEnd(e: PointerEvent, view: PageView): void {
  if (state.tool === "ask" && askStart) {
    const pt = toPagePoint(e, view);
    finishAskSelection(view, askStart, pt);
    askStart = null;
    return;
  }

  if (currentEraserGesture) {
    const cmd = currentEraserGesture.finish();
    currentEraserGesture = null;
    if (cmd) {
      getHistory(view.page.id).push(cmd);
      view.tiles.markAllDirty();
      view.tiles.renderDirty(view.page);
      persist();
    }
    redrawLive(view, null);
    return;
  }

  if (currentGesture) {
    const stroke = currentGesture.finish();
    currentGesture = null;
    redrawLive(view, null);
    if (stroke) {
      const cmd: Command = { type: "add", stroke };
      getHistory(view.page.id).push(cmd);
      updatePage(view.page.id, (p) => growPageForStroke({ ...p, strokes: [...p.strokes, stroke] }, stroke));
      view.tiles.markDirtyForStroke(stroke);
      view.tiles.renderDirty(view.page);
    }
  }
}

function applyEraserStep(view: PageView, pt: Point): void {
  if (!currentEraserGesture) return;
  const newPage = currentEraserGesture.step(view.page, pt);
  if (newPage !== view.page) {
    view.page = newPage;
    notebook = { ...notebook, pages: notebook.pages.map((p) => (p.id === view.page.id ? newPage : p)) };
    view.tiles.markAllDirty();
    view.tiles.renderDirty(view.page);
  }
  drawEraserCursor(view, pt, state.eraserSize / 2);
}

function undo(): void {
  if (!activePageId) return;
  const view = pageViews.get(activePageId);
  if (!view) return;
  const h = getHistory(activePageId);
  view.page = h.undo(view.page);
  notebook = { ...notebook, pages: notebook.pages.map((p) => (p.id === view.page.id ? view.page : p)) };
  view.tiles.markAllDirty();
  view.tiles.renderDirty(view.page);
  persist();
}

function redo(): void {
  if (!activePageId) return;
  const view = pageViews.get(activePageId);
  if (!view) return;
  const h = getHistory(activePageId);
  view.page = h.redo(view.page);
  notebook = { ...notebook, pages: notebook.pages.map((p) => (p.id === view.page.id ? view.page : p)) };
  view.tiles.markAllDirty();
  view.tiles.renderDirty(view.page);
  persist();
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
});

// --- Manual single-finger scroll ---
//
// touch-action is "none" on every input layer (see styles.css for why:
// touch-action is locked in at first contact, so toggling a class after a
// palm lands is too late to hand a scroll back to the browser mid-gesture).
// That means the browser will never scroll for us on touch, so we drive it
// ourselves here -- gated on no pen being active, so a resting palm while
// actually writing still can't scroll the page.
let scrollTouchId: number | null = null;
let lastScrollY = 0;

scrollEl.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType !== "touch") return;
    if (anyPenActive) return;
    if (scrollTouchId !== null) return; // already tracking one finger; ignore a 2nd
    scrollTouchId = e.pointerId;
    lastScrollY = e.clientY;
  },
  { capture: true }
);

scrollEl.addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerId !== scrollTouchId) return;
    if (anyPenActive) {
      // pen became active mid-drag (e.g. hovered in): stop scrolling instantly.
      scrollTouchId = null;
      return;
    }
    const dy = e.clientY - lastScrollY;
    lastScrollY = e.clientY;
    scrollEl.scrollTop -= dy;
  },
  { capture: true }
);

function endScrollTouch(e: PointerEvent): void {
  if (e.pointerId === scrollTouchId) scrollTouchId = null;
}
scrollEl.addEventListener("pointerup", endScrollTouch, { capture: true });
scrollEl.addEventListener("pointercancel", endScrollTouch, { capture: true });

// --- Ask tool selection overlay ---

function startAskOverlay(view: PageView): void {
  askOverlayEl = document.createElement("div");
  askOverlayEl.style.position = "absolute";
  askOverlayEl.style.border = "2px dashed #4a5cff";
  askOverlayEl.style.background = "rgba(74,92,255,0.15)";
  askOverlayEl.style.pointerEvents = "none";
  view.root.appendChild(askOverlayEl);
}

function updateAskOverlay(view: PageView, start: Point, current: Point): void {
  if (!askOverlayEl) return;
  const rect = normalizeRect(start, current);
  const zoom = getViewport(view).zoom || 1;
  askOverlayEl.style.left = `${rect.minX * zoom}px`;
  askOverlayEl.style.top = `${rect.minY * zoom}px`;
  askOverlayEl.style.width = `${(rect.maxX - rect.minX) * zoom}px`;
  askOverlayEl.style.height = `${(rect.maxY - rect.minY) * zoom}px`;
}

async function finishAskSelection(view: PageView, start: Point, end: Point): Promise<void> {
  askOverlayEl?.remove();
  askOverlayEl = null;
  const rect = normalizeRect(start, end);
  if (rect.maxX - rect.minX < 5 || rect.maxY - rect.minY < 5) return; // ignore tiny/accidental taps

  const file = await cropPageToPngFile(view.page, rect);
  const result = await openAskPanel(file);
  if (result === "sent" || result === "copied") {
    state.tool = "pen";
    toolbarApi.setActiveTool("pen");
  }
}

// --- Bootstrap: load persisted notebook if present ---

async function bootstrap(): Promise<void> {
  const meta = await getMeta();
  const idToLoad = meta.lastOpenedNotebookId ?? DEFAULT_NOTEBOOK_ID;
  const loaded = await loadNotebook(idToLoad);
  if (loaded) {
    notebook = loaded;
  } else {
    await saveNotebook(notebook);
  }
  await setMeta({ lastOpenedNotebookId: notebook.id });
  renderNotebookStructure();
  activePageId = notebook.pages[0]?.id ?? null;

  const savedScroll = meta.scrollPositions?.[notebook.id];
  if (savedScroll) scrollEl.scrollTop = savedScroll;

  scrollEl.addEventListener(
    "scroll",
    debounce(() => {
      void setMeta({
        scrollPositions: { ...(meta.scrollPositions ?? {}), [notebook.id]: scrollEl.scrollTop },
      });
    }, 500)
  );
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

void bootstrap();
