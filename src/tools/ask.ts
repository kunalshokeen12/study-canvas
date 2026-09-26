// AskTarget interface (v2 seam) + implementations for Web Share and Clipboard.
export type AskTarget = {
  name: string;
  isAvailable(): boolean;
  send(image: File, note: string): Promise<void>;
};

export const DEFAULT_ASK_NOTE = "I'm stuck on this step. Give me a hint only, not the solution.";

export class WebShareTarget implements AskTarget {
  name = "share";

  isAvailable(): boolean {
    if (typeof navigator === "undefined") return false;
    if (!("canShare" in navigator) || !("share" in navigator)) return false;
    try {
      // A minimal 1x1 png test file to probe canShare({files}) support.
      const testFile = new File([new Uint8Array([0])], "test.png", { type: "image/png" });
      return !!navigator.canShare?.({ files: [testFile] });
    } catch {
      return false;
    }
  }

  async send(image: File, note: string): Promise<void> {
    if (!navigator.canShare?.({ files: [image] })) {
      throw new Error("Web Share with files is not supported on this device/browser.");
    }
    await navigator.share({ files: [image], text: note });
  }
}

export class ClipboardTarget implements AskTarget {
  name = "clipboard";

  isAvailable(): boolean {
    return (
      typeof navigator !== "undefined" &&
      "clipboard" in navigator &&
      typeof window !== "undefined" &&
      "ClipboardItem" in window
    );
  }

  async send(image: File): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("Clipboard image write is not supported on this device/browser.");
    }
    const blob = image.slice(0, image.size, image.type);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }

  async copyText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }
}
