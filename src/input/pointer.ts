// Pointer routing and palm rejection, per PLAN.md section 2.3.
//
// Rules:
// - pointerType 'pen'   -> draws/erases/selects
// - pointerType 'touch' -> never draws; only scrolls (native) / pinch-zooms
// - pointerType 'mouse' -> draws (desktop dev only)
// - While a pen is down OR hovering, ignore ALL touch pointers entirely
//   (including scroll), so a resting palm doesn't jerk the page. Keep
//   ignoring touch for PEN_GRACE_MS after the pen leaves.
// - touch-action is read at pointerdown, so it must be set based on hover
//   state (before the touch pointerdown happens), not toggled mid-gesture.

export const PEN_GRACE_MS = 300;

export type PointerRouterOptions = {
  /** Called for pen/mouse pointerdown that should start a drawing/erasing gesture. */
  onDrawStart: (e: PointerEvent) => void;
  /** Called for pen/mouse pointermove during an active gesture (coalesced events expanded). */
  onDrawMove: (e: PointerEvent) => void;
  /** Called for pen/mouse pointerup/cancel ending the gesture. */
  onDrawEnd: (e: PointerEvent) => void;
  /**
   * Called whenever the "pen is active" state changes (hovering, down, or
   * within the post-leave grace period). Used to toggle touch-action class
   * on canvases and suppress touch scrolling.
   */
  onPenActiveChange: (active: boolean) => void;
};

export class PointerRouter {
  private opts: PointerRouterOptions;
  private drawingPointerId: number | null = null;
  private penActive = false;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: PointerRouterOptions) {
    this.opts = opts;
  }

  private setPenActive(active: boolean): void {
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (active !== this.penActive) {
      this.penActive = active;
      this.opts.onPenActiveChange(active);
    }
  }

  private startGraceTimer(): void {
    if (this.graceTimer !== null) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      this.penActive = false;
      this.opts.onPenActiveChange(false);
    }, PEN_GRACE_MS);
  }

  isPenActive(): boolean {
    return this.penActive;
  }

  /** Route a pointerdown event. Returns true if the event was consumed (drawing). */
  handlePointerDown(e: PointerEvent, target: Element): boolean {
    if (e.pointerType === "touch") {
      // While pen is active (down or in grace period), swallow touch entirely.
      if (this.penActive) return true; // consumed = ignored
      return false; // let it scroll
    }
    // pen or mouse: start a drawing gesture
    this.setPenActive(true);
    this.drawingPointerId = e.pointerId;
    target.setPointerCapture(e.pointerId);
    this.opts.onDrawStart(e);
    return true;
  }

  handlePointerMove(e: PointerEvent): boolean {
    if (e.pointerType === "touch") {
      return this.penActive; // consumed (ignored) while pen active
    }
    if (e.pointerType === "pen") {
      // hover (buttons === 0) or active drag both count as "pen active"
      this.setPenActive(true);
    }
    if (this.drawingPointerId !== null && e.pointerId === this.drawingPointerId) {
      this.opts.onDrawMove(e);
      return true;
    }
    return false;
  }

  handlePointerUp(e: PointerEvent): boolean {
    if (e.pointerType === "touch") {
      return this.penActive;
    }
    if (this.drawingPointerId !== null && e.pointerId === this.drawingPointerId) {
      this.drawingPointerId = null;
      this.opts.onDrawEnd(e);
      if (e.pointerType === "pen") this.startGraceTimer();
      return true;
    }
    return false;
  }

  handlePointerCancel(e: PointerEvent): void {
    if (this.drawingPointerId !== null && e.pointerId === this.drawingPointerId) {
      this.drawingPointerId = null;
      this.opts.onDrawEnd(e);
    }
    if (e.pointerType === "pen") this.startGraceTimer();
  }

  /** pointerleave/pointerout for a hovering (not down) pen: start grace period. */
  handlePointerLeave(e: PointerEvent): void {
    if (e.pointerType === "pen" && this.drawingPointerId === null) {
      this.startGraceTimer();
    }
  }
}

/** Resolve effective pressure: substitute 0.5 if a pen reports 0 while buttons>0. */
export function resolvePressure(e: PointerEvent): number {
  if (e.pointerType === "pen" && e.pressure === 0 && e.buttons > 0) {
    return 0.5;
  }
  if (e.pointerType === "mouse") {
    // simulate pressure for mouse; perfect-freehand handles this via
    // simulatePressure option in render, but a stable mid value is stored.
    return 0.5;
  }
  return e.pressure;
}

/** True if the barrel/side button is held (S Pen side button -> temp eraser). */
export function isBarrelButtonHeld(e: PointerEvent): boolean {
  return (e.buttons & 2) !== 0;
}

/**
 * Expand a pointermove event into its coalesced events (full S Pen sample
 * rate). Falls back to [e] if unsupported. Per pitfall: getCoalescedEvents
 * already includes the event itself, so callers must NOT also process `e`
 * separately when this list is non-empty.
 */
export function getCoalesced(e: PointerEvent): PointerEvent[] {
  if (typeof e.getCoalescedEvents === "function") {
    const list = e.getCoalescedEvents();
    if (list.length > 0) return list;
  }
  return [e];
}
