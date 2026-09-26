# Study Canvas

A Samsung-Notes-style handwriting PWA for a Galaxy Tab with S Pen. Pressure-sensitive
pen, highlighter, stroke/partial eraser, infinite vertically scrolling pages,
undo/redo, IndexedDB persistence, installable PWA, and an "Ask Claude" tool
that crops a selected region to a PNG and hands it to the Claude Android app —
so you never have to pick up your phone. See `PLAN.md` for the full spec and
`NOTES.md` for what was actually built, deviations, and known issues.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173, desktop Chrome only (mouse = pen)
npm run build         # tsc --noEmit-equivalent (via tsc) + vite build -> dist/
npm run preview       # serve the production build locally
npm test              # vitest run (unit tests: model, geometry, export, tools)
npm run typecheck     # tsc --noEmit
```

## Deploying (not done by this agent — see NOTES.md)

Vite's `base` must match the path the app is served from. For GitHub Pages
project hosting at `https://<user>.github.io/study-canvas/`, build with:

```bash
VITE_BASE=/study-canvas/ npm run build
```

For any other static host serving from the domain root, the default `base: '/'`
is fine — just `npm run build` and upload `dist/`.

The app **must** be served over HTTPS (or `localhost`) — service workers,
clipboard image writes, and Web Share with files all require a secure context.
`npm run dev -- --host` on the LAN will **not** give you HTTPS, so the Ask
Claude tool's Send/Copy buttons won't work there — use LAN dev only for
drawing/eraser testing, and test Phase 5 on a real HTTPS deployment.

## Recommended on-device setup: Samsung Split Screen

1. Install Study Canvas from its HTTPS URL (Chrome menu → "Add to Home
   screen"/"Install").
2. Open Study Canvas, then open the Claude Android app.
3. Recent Apps → drag one app's icon onto the other, or use the Edge Panel
   "Apps pair", to open both in split screen. Study Canvas on the left
   (~65% width), Claude app on the right.
4. Use the "Ask" tool, drag a rectangle over the stuck region, tap
   "Send to Claude app" (or "Copy image" as a fallback and paste into
   Claude). It lands directly in the right-hand pane — you never leave the
   tablet screen or touch the phone.
5. In One UI: Settings → Advanced features → Labs / Multi window, if split
   screen / app pairs aren't already enabled.
