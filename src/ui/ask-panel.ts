// Ask Claude bottom sheet: preview, note field, Send/Copy/Cancel.
// Per Pitfalls (section 11): pre-render the File and pre-create the blob
// when the sheet OPENS, so the Send/Copy tap calls share()/clipboard.write()
// synchronously inside the click handler (preserving user-activation).
import { DEFAULT_ASK_NOTE, WebShareTarget, ClipboardTarget } from "../tools/ask.ts";

const NOTE_STORAGE_KEY = "sc-ask-note";

export type AskPanelResult = "sent" | "copied" | "cancelled";

export function openAskPanel(file: File): Promise<AskPanelResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sc-sheet-overlay";

    const sheet = document.createElement("div");
    sheet.className = "sc-sheet";

    const img = document.createElement("img");
    img.className = "sc-sheet-preview";
    img.src = URL.createObjectURL(file);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note to Claude:";
    const noteField = document.createElement("textarea");
    noteField.className = "sc-sheet-note";
    noteField.value = localStorage.getItem(NOTE_STORAGE_KEY) ?? DEFAULT_ASK_NOTE;
    noteField.rows = 3;

    const status = document.createElement("div");
    status.className = "sc-sheet-status";

    const shareTarget = new WebShareTarget();
    const clipboardTarget = new ClipboardTarget();

    const btnRow = document.createElement("div");
    btnRow.className = "sc-sheet-buttons";

    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "sc-btn-primary";
    sendBtn.textContent = "Send to Claude app";
    if (!shareTarget.isAvailable()) {
      sendBtn.disabled = true;
      sendBtn.title = "Web Share with images isn't supported in this browser. Use Copy image instead.";
    }
    sendBtn.addEventListener("click", () => {
      // Called synchronously inside the click handler to preserve
      // transient user activation (required by navigator.share).
      localStorage.setItem(NOTE_STORAGE_KEY, noteField.value);
      shareTarget
        .send(file, noteField.value)
        .then(() => {
          cleanup();
          resolve("sent");
        })
        .catch((err: unknown) => {
          status.textContent = `Share failed: ${err instanceof Error ? err.message : String(err)}`;
        });
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "sc-btn-secondary";
    copyBtn.textContent = "Copy image";
    if (!clipboardTarget.isAvailable()) {
      copyBtn.disabled = true;
      copyBtn.title = "Clipboard image write isn't supported in this browser.";
    }
    copyBtn.addEventListener("click", () => {
      localStorage.setItem(NOTE_STORAGE_KEY, noteField.value);
      clipboardTarget
        .send(file)
        .then(() => {
          status.textContent = "Copied. Paste it into Claude.";
        })
        .catch((err: unknown) => {
          status.textContent = `Copy failed: ${err instanceof Error ? err.message : String(err)}`;
        });
    });

    const copyNoteBtn = document.createElement("button");
    copyNoteBtn.type = "button";
    copyNoteBtn.className = "sc-btn-secondary";
    copyNoteBtn.textContent = "Copy note";
    copyNoteBtn.addEventListener("click", () => {
      clipboardTarget
        .copyText(noteField.value)
        .then(() => {
          status.textContent = "Note copied.";
        })
        .catch((err: unknown) => {
          status.textContent = `Copy failed: ${err instanceof Error ? err.message : String(err)}`;
        });
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "sc-btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve("cancelled");
    });

    btnRow.append(sendBtn, copyBtn, copyNoteBtn, cancelBtn);
    sheet.append(img, noteLabel, noteField, status, btnRow);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function cleanup(): void {
      URL.revokeObjectURL(img.src);
      overlay.remove();
    }
  });
}
