# Study Canvas: Build Plan

This plan is for an implementing agent (for example Sonnet) that has NOT seen the design conversation.
Follow the phases in order. Do not start a phase until the previous phase's acceptance checks pass.
If something in this plan turns out wrong on the real device, stop and write the finding in
`NOTES.md` rather than improvising a big redesign.

---

## 0. Context (read fully first)

### The user and the problem
- The user studies for TUM M.Sc. Mathematics exams by working through practice problems written by hand
  on a **Samsung Galaxy Tab S-series with an S Pen**.
- When stuck, they currently pick up their phone, photograph the page, and send it to their
  **Claude.ai Project** (claude.ai web/app). That Project already holds their lectures, assignments and
  study flow, so it must stay the place questions go (for now).
- Picking up the phone breaks focus: they drift into Instagram, texting, and other distractions. **The
  whole point of this app is to keep them on the tablet.** The phone must never be needed.

### What we are building (v1)
A handwriting notebook web app (installable PWA) that runs in Chrome on the tablet:
1. Samsung-Notes-style writing: pen with pressure, pen thicknesses, colours, eraser, highlighter,
   palm rejection, long vertically scrolling pages, undo/redo.
2. A **"Ask Claude" tool**: the user drags a rectangle around the part of the page they're stuck on.
   The app turns that region into a PNG image and hands it to the Claude Android app in one tap
   (details in Phase 5).

### What we are NOT building in v1
- No calling the Anthropic API, no API key, no backend server. (That's the v2 upgrade path; see section 9.)
- No embedding claude.ai in an iframe. **Verified 2026-09-26:** claude.ai sends
  `X-Frame-Options: SAMEORIGIN` and a strict CSP, so iframe embedding is impossible. Do not try it or
  work around it.
- No accounts, sync, or cloud storage. Notes live on the tablet only (IndexedDB).
- No handwriting recognition/OCR.

### Hard constraints
- The app must be served over **HTTPS** (or `localhost`). Service workers, `navigator.clipboard.write`
  for images, and `navigator.share` with files all require a secure context.
- Target browser: **Chrome for Android (latest)** on Galaxy Tab. Desktop Chrome is for development only.
  Samsung Internet support is nice-to-have, not required.
- The user's notes are private (exam material, grades context). Nothing leaves the device except the
  image the user explicitly sends.

---

## 1. Tech stack (fixed; do not substitute)

| Concern | Choice | Why |
|---|---|---|
| Build tool | Vite + TypeScript (strict) | Fast, simple static output |
| UI | Vanilla TS + plain CSS (no React/Vue) | The UI is a toolbar and a panel; a framework adds weight and latency to the canvas path |
| Stroke shape | `perfect-freehand` (MIT) | Pressure-sensitive outline polygons, battle-tested |
| Storage | IndexedDB via `idb` (small wrapper) | Handles large stroke data; localStorage is too small |
| PWA | `vite-plugin-pwa` | Manifest + service worker for offline and "install" |
| Unit tests | Vitest | Pure logic: geometry, eraser, undo, serialization |
| Hosting | Static host with HTTPS (section 8) | No server code |

Node and npm are installed on the dev PC (Windows 11, npm 11.x). The `terminal` tool runs git-bash:
use POSIX syntax and forward-slash native paths (`C:/Users/Shoke/...`).

Project root: `C:/Users/Shoke/projects/study-canvas/`

---

## 2. Architecture

### 2.1 Data model (the source of truth is vector data, never pixels)

```ts
type Point = { x: number; y: number; p: number; t: number }; // page coords, pressure 0..1, ms
type Tool = 'pen' | 'highlighter';
type Stroke = {
  id: string;            // crypto.randomUUID()
  tool: Tool;
  color: string;         // '#RRGGBB'
  size: number;          // base width in page units
  points: Point[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number }; // cached, for hit tests + culling
};
type Page = { id: string; strokes: Stroke[]; height: number };   // width is fixed (PAGE_WIDTH)
type Notebook = { id: string; title: string; pages: Page[]; updatedAt: number; version: 1 };
```

- `PAGE_WIDTH = 1000` logical units. All stored coordinates are page units, independent of screen size,
  zoom and devicePixelRatio. Convert screen to page coords at input time only.
- Page `height` starts at `1414` (A4 ratio) and grows in steps of `1000` when the user writes within
  `300` units of the bottom (the "endless scroll" feel).
- A notebook has multiple pages; one notebook per course is the expected use (for example "MA2409 Probability").

### 2.2 Rendering layers (per visible page)
1. **Static layer**: a canvas holding all committed strokes. Redrawn only when strokes change,
   the viewport changes, or on zoom.
2. **Live layer**: a canvas on top for the stroke currently being drawn. Get it with
   `getContext('2d', { desynchronized: true })` for low latency. Cleared and re-drawn each pointer frame.
   On pointerup, the stroke is committed into the static layer.
3. **Overlay layer** (DOM or a third canvas): selection rectangle, eraser cursor, hover indicator.

Long pages: do NOT allocate one giant canvas (Android Chrome caps canvas area and will fail silently
or crash). Use **tiles**: split each page into vertical tiles of `1024` page units, one canvas per tile,
created and rendered lazily with `IntersectionObserver` and released when far off-screen. A stroke is
drawn into every tile its bbox intersects.

Canvas backing size = CSS size x `devicePixelRatio` (cap DPR at 2 to limit memory).

### 2.3 Input model (this is the most important part)
Use **Pointer Events only** (no mouse/touch events).

- `pointerType === 'pen'` → draws / erases / selects, depending on the active tool.
- `pointerType === 'touch'` → **never draws**. Touch is for scrolling (one finger) and pinch-zoom
  (two fingers). This is the palm rejection strategy: a palm can at most scroll, never mark the page.
- `pointerType === 'mouse'` → draws (desktop development only).
- While a pen pointer is down or hovering (`pointerover`/`pointermove` with `buttons === 0` from a pen),
  **ignore all touch pointers entirely**, including scroll, so a resting palm doesn't jerk the page.
  Keep ignoring touch for `300 ms` after the pen leaves (`pointerleave`/`pointerout`).
- CSS: the scroll container gets `touch-action: pan-y pinch-zoom`. Canvases get `touch-action: none`
  only while a pen is active (toggle a class), so native finger scrolling keeps working.
- Call `setPointerCapture` on pen pointerdown.
- Use `event.getCoalescedEvents()` in pointermove for full-rate S Pen samples. Optionally render
  `event.getPredictedEvents()` on the live layer only, and never store them.
- Pressure: `event.pressure` (0..1). If a pen reports `0` pressure while `buttons > 0`, substitute `0.5`.
- **S Pen side button**: while held, pen events have `buttons & 2` (barrel button). Map it to
  "temporary eraser" while held. Verify on-device; log what `buttons`/`button` values actually arrive
  and record them in NOTES.md.
- Add a settings toggle "Finger drawing" (default OFF) for the case where the pen misbehaves.

### 2.4 Module layout
```
src/
  main.ts              bootstraps app, wires modules
  model/types.ts       types above
  model/notebook.ts    pure functions: addStroke, removeStrokes, splitStroke, growPage...
  model/history.ts     undo/redo command stack (pure)
  geometry/hit.ts      point-to-segment distance, bbox intersects, rect contains
  geometry/eraser.ts   stroke-erase + partial-erase (pure)
  render/strokes.ts    perfect-freehand → Path2D, draw stroke to a ctx with a transform
  render/tiles.ts      tile management, IntersectionObserver
  input/pointer.ts     pointer routing, palm rejection, coalesced events
  tools/pen.ts, tools/eraser.ts, tools/highlighter.ts, tools/ask.ts
  ui/toolbar.ts        tool buttons, sizes, colours
  ui/ask-panel.ts      preview + send actions
  storage/db.ts        IndexedDB load/save, debounced autosave
  export/crop.ts       render a page-rect to PNG Blob
styles.css
tests/                 vitest specs mirroring src/model, src/geometry, src/export
```
Rule: everything in `model/` and `geometry/` is pure (no DOM) and unit-tested.

---

## 3. Phase 1: Skeleton and pen drawing

Tasks
1. `npm create vite@latest study-canvas -- --template vanilla-ts` in `C:/Users/Shoke/projects/`
   (the folder already contains this PLAN.md; keep it). `git init`, first commit.
2. Add deps: `perfect-freehand`, `idb`; dev: `vitest`, `vite-plugin-pwa`.
3. Implement one page with tiles, pen input, perfect-freehand rendering, pressure.
   perfect-freehand options to start with: `{ size, thinning: 0.6, smoothing: 0.5, streamline: 0.4,
   simulatePressure: false }` for pen; `simulatePressure: true` for mouse.
4. Fixed toolbar at the top: pen, 3 size presets (thin 2, medium 4, thick 8 page units), 5 colours
   (black, blue, red, green, a highlighter yellow reserved for Phase 2).
5. Finger scrolls the page natively; pen never scrolls.

Acceptance (all required)
- [ ] Desktop Chrome: mouse draws, wheel scrolls, strokes are smooth with no gaps at fast movement.
- [ ] Chrome DevTools device emulation "touch": a touch drag scrolls, does not draw.
- [ ] `npm run build` passes with zero TypeScript errors (strict).
- [ ] Unit tests exist for coordinate conversion (screen to page and back, with scroll offset and DPR).

## 4. Phase 2: Eraser, highlighter, undo/redo, growing pages

Tasks
1. **Stroke eraser** (default): erasing removes every stroke whose path passes within `r` of the eraser
   point (`r` = eraser size / 2). Test against segments, not only points, so a fast eraser swipe
   across a line catches it: also test the eraser's own movement segment against stroke segments.
   Use stroke bbox as a cheap pre-filter.
2. **Partial eraser** (second eraser mode): remove points within `r`, splitting the stroke into
   separate strokes at the gaps; drop fragments with fewer than 2 points. Pure function
   `splitStroke(stroke, circle) → Stroke[]`, unit-tested.
3. Eraser size presets: small 10, medium 25, large 60. Show a circle cursor at the pen hover position.
4. **Highlighter**: fixed width 20, colour yellow `#FFE600`, drawn with `globalAlpha 0.35` and
   `globalCompositeOperation 'multiply'`, no pressure thinning. Render highlighter strokes *before*
   pen strokes in each tile so ink stays crisp on top.
5. **Undo/redo**: command stack with `AddStroke`, `RemoveStrokes` (stores removed strokes and indices),
   `ReplaceStrokes` (for partial erase). One eraser gesture (down to up) = one undo step.
   Toolbar buttons + keyboard `Ctrl+Z` / `Ctrl+Shift+Z` for desktop. Cap history at 200 entries.
6. **Page growth** per section 2.1. Add "+ new page" at the end of the notebook.

Acceptance
- [ ] Unit tests: eraser hit-test (point on line, point near endpoint, fast swipe crossing a line),
      splitStroke (middle, start, end, whole stroke removed), undo/redo round trips for all 3 commands.
- [ ] Undo after a partial erase restores the exact original stroke (deep equal).
- [ ] Writing near the bottom grows the page; scroll position does not jump.

## 5. Phase 3: Persistence and notebooks

Tasks
1. IndexedDB database `study-canvas`, store `notebooks` (key = id). Autosave debounced 1 s after the
   last change and on `visibilitychange` to hidden (Android kills background tabs without warning).
2. Notebook list screen: create, rename, delete (with confirm), open. Last-opened notebook opens on launch.
3. Remember scroll position per notebook.
4. Export/import notebook as a `.json` file (a backup escape hatch, since data is device-local).
   Validate `version` on import; reject unknown versions with a clear message.

Acceptance
- [ ] Draw, reload the page: everything is back, same scroll position.
- [ ] Round-trip test: serialize then deserialize gives a deep-equal notebook.
- [ ] A 50-stroke-per-page, 10-page notebook loads in under 1 s on desktop.

## 6. Phase 4: PWA install

Tasks
1. `vite-plugin-pwa` with `registerType: 'autoUpdate'`. Manifest: name "Study Canvas",
   `display: 'fullscreen'` (falls back to standalone), `orientation: 'any'`, theme colour, icons
   192/512 (simple generated icon is fine).
2. Offline: app shell cached, so the app opens with no network.
3. Prevent accidental exits: no pull-to-refresh (`overscroll-behavior: contain` on body),
   no text selection/callouts on canvases (`user-select: none; -webkit-touch-callout: none`),
   block the context menu on canvases (S Pen long-press can trigger it).

Acceptance
- [ ] Lighthouse PWA "installable" passes.
- [ ] Airplane-mode reload works after the first visit.

## 7. Phase 5: The "Ask Claude" tool (the core feature)

### User flow
1. Tap the "Ask" tool (distinct icon + colour, for example a question-mark bubble).
2. Drag a rectangle with the pen over the stuck region. It may span tile boundaries.
3. A bottom sheet opens with: a preview of the cropped image, an optional note field
   (prefilled text, see below), and buttons:
   - **Send to Claude app** (primary)
   - **Copy image** (fallback)
   - **Cancel**
4. After sending, the tool returns to the pen automatically, so the user can keep writing.

### Cropping (`export/crop.ts`)
- Render the selected page rect **from vector data** (not by reading screen canvases) onto an offscreen
  canvas at scale `2`, white background, with highlighter then pen strokes. Add 16 page units padding.
- Clamp output to at most 2048 px on the longest side.
- `canvas.toBlob('image/png')` then `File([blob], 'question.png', { type: 'image/png' })`.
- Unit-test the rect math (clamping, padding, strokes partially inside the rect are clipped, not dropped).

### Hand-off to Claude (implement BOTH, test which works on-device)
A. **Web Share (primary):**
   ```ts
   if (navigator.canShare?.({ files: [file] })) {
     await navigator.share({ files: [file], text: noteText });
   }
   ```
   This opens the Android share sheet; the user picks the Claude app (Android lets them pin it to the
   top of the share sheet, so after the first time this is one tap). The Claude app opens with the image
   attached. The user must then pick their Project/chat inside the Claude app. Record in NOTES.md
   whether the Claude app lands in a new chat or lets them pick the Project, and whether `text` is kept.
B. **Clipboard (fallback):**
   ```ts
   await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
   ```
   Show a toast: "Copied, paste it into Claude". Handle rejection (permission denied / unsupported)
   with a clear message. Never fail silently.

### Note text
- Default prefilled note: `"I'm stuck on this step. Give me a hint only, not the solution."`
  The user's standing study rule is **hints only, no full solutions unless explicitly asked**. Keep this
  default. The field is editable and the last used text is remembered.
- For the clipboard path, a second button "Copy note" copies the text separately (clipboards hold one item reliably).

### Recommended screen setup (document it in README, no code needed)
Samsung **split screen**: Study Canvas on the left (about 65%), Claude app on the right. Then Web Share or
paste lands in the right pane and the user never leaves the tablet screen. Settings > Advanced features >
Labs / Multi window on One UI. This is the closest thing to "in-app answers" achievable without the API.

Acceptance
- [ ] Desktop: selecting a region that crosses a tile boundary produces a correct PNG
      (download it via a debug button to inspect).
- [ ] Desktop Chrome: clipboard path works (paste into any image-accepting app).
- [ ] Share button is hidden/disabled with explanation when `navigator.canShare` is false.
- [ ] On-device (user-run, see section 10): the share sheet shows Claude; the image arrives in the Claude app.

## 8. Hosting (HTTPS required)

Recommended: **GitHub Pages** from a **public** repo.
- The user's GitHub is `kunalshokeen12`; `gh` is authenticated on the dev PC.
- GitHub Pages on a free account requires a public repo. That's fine: the repo holds only app code.
  Notes live in the tablet's IndexedDB and never touch the repo. **Do not commit any user data or sample
  notebooks with real content.**
- **Ask the user before creating the repo**: they have a private `quiet-lantern-7` repo reserved for new
  work, but Pages would need it public. Default proposal: a new public repo `study-canvas`.
- Vite `base` must be `'/study-canvas/'` for project Pages. Deploy with a GitHub Actions workflow
  (`actions/deploy-pages`) on push to `main`.

Alternative if the user refuses public: Cloudflare Pages or Netlify (free, private repo OK), or
`tailscale serve` from the always-on Windows PC (HTTPS on the tailnet; only works when the PC is up).

Local on-device testing before deploy: `npm run dev -- --host` and open it on the tablet over the LAN
**will not** give HTTPS, so clipboard/share/SW won't work there. Use it for drawing tests only;
test Phase 5 on the deployed HTTPS URL.

## 9. v2 upgrade path (do NOT build now; keep the seams clean)
- Replace the hand-off with an in-app answer panel calling the Anthropic Messages API (vision) with the
  user's course material supplied as cached system-prompt documents (Claude.ai Projects are NOT
  accessible via API; verified. Do not use unofficial session-cookie endpoints).
- The API key must never be in the frontend. This needs a tiny backend (for example a Hermes webhook on the
  user's always-on PC reached over Tailscale, or a serverless function).
- Keep `tools/ask.ts` calling an interface `AskTarget { send(image: File, note: string): Promise<void> }`
  so v2 only adds a new implementation.

## 10. Verification

### Agent-run (must all pass before reporting done)
- `npm run build`: zero errors. `npx vitest run`: all green. `npx tsc --noEmit`: clean.
- Grep the repo: no API keys, tokens, or `.env` committed; `.gitignore` covers `node_modules`, `dist`.
- Manual desktop pass in Chrome with DevTools touch emulation for every acceptance box above.
- Write `NOTES.md`: what was built, deviations from this plan with reasons, known issues.

### User-run on the Galaxy Tab (hand this checklist to the user; agent cannot do it)
1. Open the Pages URL in Chrome, then menu > "Add to Home screen"/"Install". Launch from the icon.
2. Rest the palm on the screen and write a long line of maths with the S Pen: no stray marks, no scroll jumps.
3. Scroll with one finger, pinch-zoom with two, while the pen is away from the screen.
4. Pressure: light vs hard strokes visibly differ in width.
5. Hold the S Pen side button and swipe: erases. Release: pen again.
6. Write at the bottom: page grows. Close the app completely and reopen: notes intact.
7. Ask tool: select a region, Send to Claude app: Claude app appears in the share sheet and receives the image.
8. Split screen with the Claude app: the whole loop works without touching the phone.
9. Report pen latency feel (fine / slightly laggy / bad). If bad, check `desynchronized: true` and
   whether predicted events help.

## 11. Pitfalls (known in advance)
- **Giant canvases fail silently on Android.** Tiles, capped DPR. Never one canvas per whole page.
- **Palm rejection by pressure or contact size is unreliable.** Use pointerType routing (section 2.3).
- **`touch-action` is read at pointerdown**; toggling it mid-gesture doesn't help. Set it based on hover state.
- **Coalesced events** exist only on pointermove, and the list includes the event itself; don't double-add.
- **Autosave on unload doesn't fire on Android**; use `visibilitychange`.
- **Clipboard image write** needs a user gesture and HTTPS; call it directly inside the click handler, not after an `await` chain that loses activation (create the blob first, when the sheet opens).
- Same for **`navigator.share`**: it needs transient user activation. Pre-render the File when the
  bottom sheet opens, so the Send tap calls `share()` immediately.
- **Highlighter over ink**: render order matters; highlighter first.
- **Never read pixels back from on-screen canvases** for export; always re-render from vectors.
- Keep the stroke format versioned (`version: 1`) so v2 can migrate.

## 12. Reporting back
When done, the implementing agent returns:
1. The deployed URL (or the reason it isn't deployed) and repo URL.
2. Output of `npm run build` and `npx vitest run` (summary lines).
3. The completed acceptance checklist, with every box checked or explained.
4. The contents of NOTES.md.
5. The user-run on-device checklist (section 10), verbatim, for the user.
