import { describe, it, expect, vi } from "vitest";
import { PointerRouter, resolvePressure, isBarrelButtonHeld, PEN_GRACE_MS } from "../../src/input/pointer.ts";

function fakeEvent(overrides: Partial<PointerEvent>): PointerEvent {
  return {
    pointerType: "pen",
    pointerId: 1,
    pressure: 0.5,
    buttons: 1,
    button: 0,
    ...overrides,
  } as PointerEvent;
}

function fakeTarget(): Element {
  return { setPointerCapture: vi.fn() } as unknown as Element;
}

describe("PointerRouter palm rejection", () => {
  it("touch pointerdown scrolls (not consumed) when pen is not active", () => {
    const router = new PointerRouter({
      onDrawStart: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onPenActiveChange: vi.fn(),
    });
    const consumed = router.handlePointerDown(fakeEvent({ pointerType: "touch", pointerId: 5 }), fakeTarget());
    expect(consumed).toBe(false);
  });

  it("pen pointerdown starts a draw gesture and marks pen active", () => {
    const onDrawStart = vi.fn();
    const onPenActiveChange = vi.fn();
    const router = new PointerRouter({
      onDrawStart,
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onPenActiveChange,
    });
    const consumed = router.handlePointerDown(fakeEvent({ pointerType: "pen", pointerId: 1 }), fakeTarget());
    expect(consumed).toBe(true);
    expect(onDrawStart).toHaveBeenCalledOnce();
    expect(onPenActiveChange).toHaveBeenCalledWith(true);
  });

  it("touch is ignored entirely while pen is active", () => {
    const router = new PointerRouter({
      onDrawStart: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onPenActiveChange: vi.fn(),
    });
    router.handlePointerDown(fakeEvent({ pointerType: "pen", pointerId: 1 }), fakeTarget());
    const touchConsumed = router.handlePointerDown(fakeEvent({ pointerType: "touch", pointerId: 5 }), fakeTarget());
    expect(touchConsumed).toBe(true); // consumed = ignored, palm can't scroll either
  });

  it("mouse draws like pen (desktop dev)", () => {
    const onDrawStart = vi.fn();
    const router = new PointerRouter({
      onDrawStart,
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onPenActiveChange: vi.fn(),
    });
    const consumed = router.handlePointerDown(fakeEvent({ pointerType: "mouse", pointerId: 2 }), fakeTarget());
    expect(consumed).toBe(true);
    expect(onDrawStart).toHaveBeenCalledOnce();
  });

  it("keeps ignoring touch for PEN_GRACE_MS after pen leaves", async () => {
    vi.useFakeTimers();
    const onPenActiveChange = vi.fn();
    const router = new PointerRouter({
      onDrawStart: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onPenActiveChange,
    });
    router.handlePointerDown(fakeEvent({ pointerType: "pen", pointerId: 1 }), fakeTarget());
    router.handlePointerUp(fakeEvent({ pointerType: "pen", pointerId: 1 }));
    // still within grace period right after pointerup
    expect(router.isPenActive()).toBe(true);
    const touchDuringGrace = router.handlePointerDown(fakeEvent({ pointerType: "touch", pointerId: 9 }), fakeTarget());
    expect(touchDuringGrace).toBe(true);

    vi.advanceTimersByTime(PEN_GRACE_MS + 10);
    expect(router.isPenActive()).toBe(false);
    const touchAfterGrace = router.handlePointerDown(fakeEvent({ pointerType: "touch", pointerId: 9 }), fakeTarget());
    expect(touchAfterGrace).toBe(false);
    vi.useRealTimers();
  });
});

describe("resolvePressure", () => {
  it("substitutes 0.5 when pen reports 0 pressure while buttons>0", () => {
    const e = fakeEvent({ pointerType: "pen", pressure: 0, buttons: 1 });
    expect(resolvePressure(e)).toBe(0.5);
  });

  it("passes through nonzero pen pressure", () => {
    const e = fakeEvent({ pointerType: "pen", pressure: 0.8, buttons: 1 });
    expect(resolvePressure(e)).toBe(0.8);
  });

  it("returns 0.5 for mouse", () => {
    const e = fakeEvent({ pointerType: "mouse", pressure: 0, buttons: 1 });
    expect(resolvePressure(e)).toBe(0.5);
  });
});

describe("isBarrelButtonHeld", () => {
  it("detects the barrel/side button bit (buttons & 2)", () => {
    expect(isBarrelButtonHeld(fakeEvent({ buttons: 2 }))).toBe(true);
    expect(isBarrelButtonHeld(fakeEvent({ buttons: 3 }))).toBe(true);
    expect(isBarrelButtonHeld(fakeEvent({ buttons: 1 }))).toBe(false);
  });
});
