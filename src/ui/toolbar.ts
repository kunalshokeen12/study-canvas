// Toolbar UI: tool selection, size presets, colours, undo/redo, add page.
import { ERASER_SIZES, PEN_SIZES, type Tool } from "../model/types.ts";

export type ActiveTool = "pen" | "highlighter" | "eraser-stroke" | "eraser-partial" | "ask";

export type ToolbarState = {
  tool: ActiveTool;
  penSize: number;
  penColor: string;
  eraserSize: number;
};

export type ToolbarCallbacks = {
  onToolChange: (tool: ActiveTool) => void;
  onPenSizeChange: (size: number) => void;
  onPenColorChange: (color: string) => void;
  onEraserSizeChange: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddPage: () => void;
};

const PEN_COLORS = ["#000000", "#1E5AFF", "#E11D1D", "#1F9D55", "#7A3FE0"];

export function createToolbar(container: HTMLElement, cb: ToolbarCallbacks): {
  setUndoEnabled: (v: boolean) => void;
  setRedoEnabled: (v: boolean) => void;
  setActiveTool: (t: ActiveTool) => void;
} {
  container.innerHTML = "";
  container.className = "sc-toolbar";

  const toolGroup = document.createElement("div");
  toolGroup.className = "sc-toolbar-group";

  const tools: Array<{ id: ActiveTool; label: string }> = [
    { id: "pen", label: "✏️ Pen" },
    { id: "highlighter", label: "🖍️ Highlight" },
    { id: "eraser-stroke", label: "🧹 Eraser" },
    { id: "eraser-partial", label: "🩹 Partial" },
    { id: "ask", label: "❓ Ask" },
  ];
  const toolButtons = new Map<ActiveTool, HTMLButtonElement>();
  for (const t of tools) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t.label;
    btn.dataset["tool"] = t.id;
    btn.addEventListener("click", () => cb.onToolChange(t.id));
    toolGroup.appendChild(btn);
    toolButtons.set(t.id, btn);
  }
  container.appendChild(toolGroup);

  const sizeGroup = document.createElement("div");
  sizeGroup.className = "sc-toolbar-group";
  for (const [label, size] of Object.entries(PEN_SIZES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label[0]!.toUpperCase();
    btn.title = `${label} (${size})`;
    btn.addEventListener("click", () => cb.onPenSizeChange(size));
    sizeGroup.appendChild(btn);
  }
  container.appendChild(sizeGroup);

  const colorGroup = document.createElement("div");
  colorGroup.className = "sc-toolbar-group";
  for (const color of PEN_COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sc-color-swatch";
    btn.style.backgroundColor = color;
    btn.addEventListener("click", () => cb.onPenColorChange(color));
    colorGroup.appendChild(btn);
  }
  container.appendChild(colorGroup);

  const eraserGroup = document.createElement("div");
  eraserGroup.className = "sc-toolbar-group";
  for (const [label, size] of Object.entries(ERASER_SIZES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label[0]!.toUpperCase();
    btn.title = `${label} eraser (${size})`;
    btn.addEventListener("click", () => cb.onEraserSizeChange(size));
    eraserGroup.appendChild(btn);
  }
  container.appendChild(eraserGroup);

  const actionGroup = document.createElement("div");
  actionGroup.className = "sc-toolbar-group";
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.textContent = "↶ Undo";
  undoBtn.addEventListener("click", () => cb.onUndo());
  const redoBtn = document.createElement("button");
  redoBtn.type = "button";
  redoBtn.textContent = "↷ Redo";
  redoBtn.addEventListener("click", () => cb.onRedo());
  const addPageBtn = document.createElement("button");
  addPageBtn.type = "button";
  addPageBtn.textContent = "+ Page";
  addPageBtn.addEventListener("click", () => cb.onAddPage());
  actionGroup.append(undoBtn, redoBtn, addPageBtn);
  container.appendChild(actionGroup);

  return {
    setUndoEnabled: (v) => (undoBtn.disabled = !v),
    setRedoEnabled: (v) => (redoBtn.disabled = !v),
    setActiveTool: (t) => {
      for (const [id, btn] of toolButtons) {
        btn.classList.toggle("active", id === t);
      }
    },
  };
}

export type { Tool };
