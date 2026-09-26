import { describe, it, expect } from "vitest";
import { screenToPage, pageToScreen, type Viewport } from "../../src/geometry/coords.ts";

describe("coordinate conversion", () => {
  it("round-trips screen -> page -> screen with no scroll/zoom", () => {
    const vp: Viewport = { scrollTop: 0, scrollLeft: 0, zoom: 1, containerLeft: 0, containerTop: 0 };
    const screen = { x: 123, y: 456 };
    const page = screenToPage(screen, vp);
    const back = pageToScreen(page, vp);
    expect(back.x).toBeCloseTo(screen.x);
    expect(back.y).toBeCloseTo(screen.y);
  });

  it("accounts for scroll offset", () => {
    const vp: Viewport = { scrollTop: 500, scrollLeft: 0, zoom: 1, containerLeft: 0, containerTop: 0 };
    const screen = { x: 10, y: 10 };
    const page = screenToPage(screen, vp);
    // scrolled down 500, so a screen point near the top maps to a page point
    // further down (10 + 500)
    expect(page.y).toBeCloseTo(510);
    expect(page.x).toBeCloseTo(10);
  });

  it("accounts for zoom", () => {
    const vp: Viewport = { scrollTop: 0, scrollLeft: 0, zoom: 2, containerLeft: 0, containerTop: 0 };
    const screen = { x: 200, y: 100 };
    const page = screenToPage(screen, vp);
    expect(page.x).toBeCloseTo(100);
    expect(page.y).toBeCloseTo(50);
    const back = pageToScreen(page, vp);
    expect(back.x).toBeCloseTo(200);
    expect(back.y).toBeCloseTo(100);
  });

  it("accounts for container offset (toolbar height etc)", () => {
    const vp: Viewport = { scrollTop: 0, scrollLeft: 0, zoom: 1, containerLeft: 20, containerTop: 60 };
    const screen = { x: 120, y: 160 };
    const page = screenToPage(screen, vp);
    expect(page.x).toBeCloseTo(100);
    expect(page.y).toBeCloseTo(100);
  });

  it("round-trips with combined scroll + zoom + container offset + DPR-irrelevance", () => {
    const vp: Viewport = { scrollTop: 300, scrollLeft: 0, zoom: 1.5, containerLeft: 15, containerTop: 40 };
    const original = { x: 77, y: 933 };
    const screen = pageToScreen(original, vp);
    const back = screenToPage(screen, vp);
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
  });
});
