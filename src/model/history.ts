// Undo/redo command stack over Page data. Pure, no DOM.
import type { Page, Stroke } from "../model/types.ts";
import { addStroke, removeStrokes, replaceStrokes } from "../model/notebook.ts";

export type AddStrokeCommand = { type: "add"; stroke: Stroke };
export type RemoveStrokesCommand = { type: "remove"; strokes: Stroke[] };
export type ReplaceStrokesCommand = {
  type: "replace";
  removed: Stroke[];
  inserted: Stroke[];
};
export type Command = AddStrokeCommand | RemoveStrokesCommand | ReplaceStrokesCommand;

export const HISTORY_LIMIT = 200;

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Push a command that has already been applied to the page. Clears redo. */
  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Apply undo to a page, returning the new page. Mutates internal stacks. */
  undo(page: Page): Page {
    const cmd = this.undoStack.pop();
    if (!cmd) return page;
    this.redoStack.push(cmd);
    return applyInverse(page, cmd);
  }

  /** Apply redo to a page, returning the new page. Mutates internal stacks. */
  redo(page: Page): Page {
    const cmd = this.redoStack.pop();
    if (!cmd) return page;
    this.undoStack.push(cmd);
    return applyForward(page, cmd);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export function applyForward(page: Page, cmd: Command): Page {
  switch (cmd.type) {
    case "add":
      return addStroke(page, cmd.stroke);
    case "remove":
      return removeStrokes(
        page,
        cmd.strokes.map((s) => s.id)
      );
    case "replace":
      return replaceStrokes(
        page,
        cmd.removed.map((s) => s.id),
        cmd.inserted
      );
  }
}

export function applyInverse(page: Page, cmd: Command): Page {
  switch (cmd.type) {
    case "add":
      return removeStrokes(page, [cmd.stroke.id]);
    case "remove":
      // re-insert removed strokes; append (order among all-else preserved by
      // replaceStrokes-less concat since remove commands are whole strokes).
      return { ...page, strokes: [...page.strokes, ...cmd.strokes] };
    case "replace":
      return replaceStrokes(
        page,
        cmd.inserted.map((s) => s.id),
        cmd.removed
      );
  }
}
