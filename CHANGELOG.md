# Changelog

## 2.3.0 — 2026-07-08

- Print button (and Ctrl/⌘+P): prints the edited document — reordered,
  rotated, and annotated pages exactly as they would export — via the
  browser's print dialog. Assembly happens locally like an export; Safari
  gets a viewer tab, and a blocked pop-up falls back to a download

## 2.2.3 — 2026-07-08

- Fixed the text tool: clicking a page created the text box, but the
  browser's own click-focus handling immediately blurred the inline editor,
  and the empty box was cleaned up before you could type — it looked like
  nothing happened. The click's default focus behavior is now suppressed
  and the editor re-focuses itself after the click settles

## 2.2.2 — 2026-07-08

- Dependencies updated across the board: pdf.js 6, Rsbuild 2, TypeScript 6,
  Vitest 4, ESLint 10 (with the React Compiler lint rules), jsdom 29
- Adapted to pdf.js 6's API: render() now receives the canvas directly and
  document teardown goes through the loading task
- Ref/effect patterns tightened to satisfy the new React hooks lint rules
  (no behavior change)

## 2.2.1 — 2026-07-08

- New social preview image (Open Graph / Twitter card) showing the actual
  editor: document tabs, annotations, a signature, and split-to-tabs

## 2.2.0 — 2026-07-08

- Multiple documents can be open at once: every opened or dropped PDF gets
  its own tab with independent pages, annotations, selection, and undo
  history; the "+" tab starts another blank document
- Splitting no longer downloads anything: each range opens as its own new
  document tab (annotations travel with their pages), ready to review,
  edit, and export individually
- "Export PDF" always exports the whole document — no need to deselect
  pages first; a separate "Export selection" button downloads just the
  selected pages, and ZIP packs every page of the document
- The toolbar file button is now "Merge PDF" (into the current document);
  dropping files anywhere opens them as tabs instead
- Closing a tab moves its imported files to "Recent"; sources shared with
  split tabs are kept alive until the last tab using them closes

## 2.1.0 — 2026-07-08

- The editor now starts with a fresh blank A4 sheet instead of an upload
  screen — build a PDF from scratch, or import files via "Add PDF" and
  drag & drop anywhere
- New "Blank page" toolbar action inserts an empty A4 page after the
  current page
- Recent in-session documents moved into a "Recent" toolbar dropdown;
  editor-created blank sheets never clutter the list
- Importing into the untouched starter sheet replaces it instead of
  leaving a stray empty page; the first imported file names the document
  (blank sheets never do)
- Closing a document immediately starts a new blank one
- Fixed "page could not be rendered" errors when opening a PDF: pdf.js
  forbids two concurrent renders into the same canvas, and rapid re-renders
  (initial fit-zoom, rotation, window resizing) could collide — in-flight
  renders are now cancelled and awaited before the next one starts

## 2.0.0 — 2026-07-08

PDF Splitter grew into **PDF Editor** — a full-featured, privacy-first PDF
editor that still runs 100% in the browser: no uploads, no accounts, no
tracking.

**New features**

- Multi-PDF import: drop several files to merge them into one editable
  document; insert pages from another PDF at any position
- Page management: drag & drop reordering (moves the whole selection),
  rotate left/right, duplicate, and delete pages; multi-select with
  Ctrl/⌘-click and Shift-ranges
- Annotations, flattened into the PDF on export: text boxes with inline
  editing, freehand drawing, highlight rectangles, shapes (rectangle,
  ellipse, line, arrow), images/stamps, and signatures (drawn or uploaded)
- Move, resize, restyle, and delete annotations; per-annotation properties
  panel (color, stroke, opacity, font size, fill)
- Undo/redo for all editing actions (up to 100 steps)
- Keyboard shortcuts for tools, pages, and history — press `?` for the map
- Zoomable main preview (fit-to-view, 25–400%) with page navigation
- Recent in-session documents: close a document and reopen it without
  re-picking the file (memory only, forgotten when the tab closes)
- Exports: full edited document, selected pages, split by ranges, or
  one-PDF-per-page ZIP — with progress reporting for long operations
- Toast notifications, onboarding empty state, responsive three-pane layout

**Under the hood**

- Migrated from npm to pnpm and from Vite to Rsbuild
- Rewritten in React 19 with a modular architecture (pdf-core, rendering,
  editor-state, export, workers, services, ui)
- PDF assembly and ZIP packing moved into a Web Worker; pdf.js and the
  export worker are lazy-loaded (initial page ~80 kB gzipped)
- Strict TypeScript everywhere, ESLint + Prettier, 120 unit/component tests
  with coverage thresholds on the core logic
- Encrypted PDFs are detected and rejected with a clear local-decryption
  hint; corrupt files report readable errors

## 1.4.1 — 2026-07-06

- The status/hint message moved from below the actions to directly under
  the drop zone, so "use a page range below" points the right way
- WCAG 2.1 AA remediation (verified with axe-core in light and dark,
  empty and loaded states — zero violations):
  - Muted text, links, error text, and primary-button text meet 4.5:1
    contrast (darkened ocean/gray shades; dark text on ocean buttons)
  - Focus rings, control borders, selected-page borders, and the drop
    zone boundary meet 3:1 non-text contrast
  - Selected pages are marked with a check mark, not color alone, and
    expose their state via aria-pressed
  - The drop zone is keyboard-operable (Enter/Space opens the file picker)
  - The large preview canvas is labelled for screen readers
  - Animations and transitions are disabled under prefers-reduced-motion

## 1.4.0 — 2026-07-06

- Theme toggle in the header: Auto / Light / Dark, persisted across visits
  and applied before first paint (no flash)
- Social sharing: Open Graph and Twitter card meta tags with a branded
  1200x630 preview image
- Design polish: upload icon and privacy hint in the drop zone, subtle
  header gradient, pill-style status messages, uppercase section labels,
  refined buttons, shadows, and focus rings
- Improved README with badges, screenshot, usage guide, and module overview

## 1.3.0 — 2026-07-06

- The footer shows the current version, injected from package.json at
  build time
- Company name is now written as "vensas GmbH" throughout (footer, page
  title, logo alt text, meta description)

## 1.2.2 — 2026-07-06

- The large preview no longer scrolls: the PDF section grew taller, the
  preview column wider, and the rendered page is capped to fit the pane

## 1.2.1 — 2026-07-06

- The large preview only appears while pages are selected, so it can no
  longer be mistaken for a selection: no more automatic preview of page 1
  after loading, deselecting the previewed page falls back to the most
  recently selected one, and clearing the selection empties the pane

## 1.2.0 — 2026-07-06

- vensas branding: logo in the header (theme-aware light/dark variants),
  brand color palette (ocean primary, jet surfaces) in both themes
- Favicon now uses the vensas mark and adapts to the browser theme
- Footer links to the vensas.de imprint page and the vensas website

## 1.1.0 — 2026-07-06

- Large preview pane next to the page grid: clicking a page shows it big and
  readable on the right, so you can check the content before extracting
- The first page is previewed automatically after loading a document
- The currently previewed page is marked with a dotted outline in the grid
- On narrow screens the preview moves above the grid instead of beside it

## 1.0.0 — 2026-07-06

Initial release.

- Drag & drop a PDF and preview all pages as thumbnails
- Extract selected pages as a single PDF
- Download selected pages as individual PDFs in a ZIP
- Split by page ranges (e.g. `1-3, 5, 8-10`) into separate PDFs
- Split the whole document into single-page PDFs as a ZIP
- All processing happens client-side — no uploads, no server
- Automated tests and GitHub Pages deployment via GitHub Actions
