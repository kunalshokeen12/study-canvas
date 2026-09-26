import { describe, it, expect } from "vitest";
import { computeCropGeometry, CROP_PADDING, CROP_MAX_DIMENSION } from "../../src/export/crop.ts";
import { createPage } from "../../src/model/notebook.ts";
import { PAGE_WIDTH } from "../../src/model/types.ts";

describe("computeCropGeometry", () => {
  it("adds padding around the rect", () => {
    const page = createPage("p1");
    const rect = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
    const geo = computeCropGeometry(rect, page);
    expect(geo.rect.minX).toBe(100 - CROP_PADDING);
    expect(geo.rect.minY).toBe(100 - CROP_PADDING);
    expect(geo.rect.maxX).toBe(200 + CROP_PADDING);
    expect(geo.rect.maxY).toBe(200 + CROP_PADDING);
  });

  it("clamps to page bounds (does not pad past edges)", () => {
    const page = createPage("p1");
    const rect = { minX: 0, minY: 0, maxX: PAGE_WIDTH, maxY: page.height };
    const geo = computeCropGeometry(rect, page);
    expect(geo.rect.minX).toBe(0);
    expect(geo.rect.minY).toBe(0);
    expect(geo.rect.maxX).toBe(PAGE_WIDTH);
    expect(geo.rect.maxY).toBe(page.height);
  });

  it("clamps output to at most CROP_MAX_DIMENSION px on the longest side", () => {
    const page = createPage("p1");
    page.height = 5000;
    const rect = { minX: 0, minY: 0, maxX: PAGE_WIDTH, maxY: 4000 };
    const geo = computeCropGeometry(rect, page);
    expect(Math.max(geo.canvasWidth, geo.canvasHeight)).toBeLessThanOrEqual(CROP_MAX_DIMENSION);
  });

  it("uses scale 2 for small regions (no clamping needed)", () => {
    const page = createPage("p1");
    const rect = { minX: 100, minY: 100, maxX: 150, maxY: 150 };
    const geo = computeCropGeometry(rect, page);
    expect(geo.scale).toBe(2);
  });
});
