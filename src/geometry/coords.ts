// Screen <-> page coordinate conversion. Page coords are logical units
// (PAGE_WIDTH wide), independent of screen size, scroll, zoom and DPR.
// Screen coords here mean "CSS pixels relative to the scroll container's
// content area" (i.e. clientX/clientY minus the container's bounding rect,
// PLUS the scroll offset, then divided by the current zoom).

export type Viewport = {
  scrollTop: number; // CSS px scrolled down in the container
  scrollLeft: number; // usually 0 (no horizontal scroll)
  zoom: number; // 1 = 1 page unit == 1 CSS px
  containerLeft: number; // bounding rect left of the scroll container, CSS px
  containerTop: number; // bounding rect top of the scroll container, CSS px
};

export type ScreenPoint = { x: number; y: number };
export type PagePoint = { x: number; y: number };

export function screenToPage(pt: ScreenPoint, vp: Viewport): PagePoint {
  const localX = pt.x - vp.containerLeft + vp.scrollLeft;
  const localY = pt.y - vp.containerTop + vp.scrollTop;
  return { x: localX / vp.zoom, y: localY / vp.zoom };
}

export function pageToScreen(pt: PagePoint, vp: Viewport): ScreenPoint {
  const localX = pt.x * vp.zoom;
  const localY = pt.y * vp.zoom;
  return {
    x: localX + vp.containerLeft - vp.scrollLeft,
    y: localY + vp.containerTop - vp.scrollTop,
  };
}

/**
 * Convert a page-unit length/coordinate to device pixels for canvas backing
 * store sizing, given zoom and a (capped) devicePixelRatio.
 */
export function pageToDevicePixels(pageUnits: number, zoom: number, dpr: number): number {
  return pageUnits * zoom * dpr;
}

export const MAX_DPR = 2;

export function cappedDPR(rawDpr: number): number {
  return Math.min(rawDpr, MAX_DPR);
}
