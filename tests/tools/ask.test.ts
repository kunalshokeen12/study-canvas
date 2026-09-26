import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebShareTarget, ClipboardTarget, DEFAULT_ASK_NOTE } from "../../src/tools/ask.ts";

describe("WebShareTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isAvailable is false when navigator.canShare is missing", () => {
    vi.stubGlobal("navigator", {});
    const target = new WebShareTarget();
    expect(target.isAvailable()).toBe(false);
  });

  it("isAvailable is true when canShare({files}) returns true", () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn(),
    });
    const target = new WebShareTarget();
    expect(target.isAvailable()).toBe(true);
  });

  it("send() calls navigator.share with files and text", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: shareMock,
    });
    const target = new WebShareTarget();
    const file = new File([new Uint8Array([1, 2, 3])], "question.png", { type: "image/png" });
    await target.send(file, DEFAULT_ASK_NOTE);
    expect(shareMock).toHaveBeenCalledWith({ files: [file], text: DEFAULT_ASK_NOTE });
  });

  it("send() throws a clear error when canShare rejects the file", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => false,
      share: vi.fn(),
    });
    const target = new WebShareTarget();
    const file = new File([new Uint8Array([1])], "question.png", { type: "image/png" });
    await expect(target.send(file, "note")).rejects.toThrow(/not supported/i);
  });
});

describe("ClipboardTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isAvailable is false without navigator.clipboard or ClipboardItem", () => {
    vi.stubGlobal("navigator", {});
    const target = new ClipboardTarget();
    expect(target.isAvailable()).toBe(false);
  });

  it("send() writes a ClipboardItem with image/png", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write: writeMock, writeText: vi.fn() } });
    vi.stubGlobal("ClipboardItem", class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    });
    const target = new ClipboardTarget();
    const file = new File([new Uint8Array([1, 2])], "question.png", { type: "image/png" });
    await target.send(file);
    expect(writeMock).toHaveBeenCalledOnce();
  });

  it("send() throws a clear error when unsupported (never fails silently)", async () => {
    vi.stubGlobal("navigator", {});
    const target = new ClipboardTarget();
    const file = new File([new Uint8Array([1])], "question.png", { type: "image/png" });
    await expect(target.send(file)).rejects.toThrow(/not supported/i);
  });

  it("copyText writes the note text separately", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn(), writeText: writeTextMock } });
    vi.stubGlobal("ClipboardItem", class {});
    const target = new ClipboardTarget();
    await target.copyText("hello");
    expect(writeTextMock).toHaveBeenCalledWith("hello");
  });
});

describe("DEFAULT_ASK_NOTE", () => {
  it("is the hints-only standing study rule text", () => {
    expect(DEFAULT_ASK_NOTE).toMatch(/hint only, not the solution/i);
  });
});
