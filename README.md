# PDF Editor

[![Test & Deploy](https://github.com/vensas/pdf-editor/actions/workflows/deploy.yml/badge.svg)](https://github.com/vensas/pdf-editor/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-6ABEA7)](LICENSE)
[![Live](https://img.shields.io/badge/live-vensas.github.io%2Fpdf--editor-2C3341)](https://vensas.github.io/pdf-editor/)

A [vensas GmbH](https://www.vensas.de) product — edit, split, merge, and annotate PDFs,
**entirely in your browser**.

**➜ [Open PDF Editor](https://vensas.github.io/pdf-editor/)**

## Why this exists

Most online PDF tools upload your document to a server you know nothing about.
This one doesn't: all processing happens locally in your browser using
[pdf-lib](https://pdf-lib.js.org) and [pdf.js](https://mozilla.github.io/pdf.js/).
**Your files never leave your machine** — safe for payslips, contracts, invoices,
and anything else you'd rather not hand to a stranger's server.

No uploads. No accounts. No tracking. No analytics. A static page on GitHub Pages.

## Features

**File handling**

- 🗂️ Multiple documents open at once, each in its own tab with independent
  pages, annotations, selection, and undo history
- 🆕 Starts with a blank A4 sheet — build a PDF from scratch or import files
- 📄 Drag & drop PDFs anywhere — every file opens as its own tab; "Merge PDF"
  combines files into the current document
- ➕ Add blank pages, or insert pages from more PDFs at any position
- 🕑 Recent documents in a toolbar menu (kept in memory for this tab only)
- 🛡️ Clear errors for corrupt, encrypted, or non-PDF files

**Page management**

- 🖼️ Thumbnail sidebar with multi-select (click, Ctrl/⌘-click, Shift-ranges)
- 🔍 Large zoomable preview (fit-to-view, 25–400%)
- ↕️ Reorder pages by drag & drop (drags the whole selection)
- 🔄 Rotate, 📑 duplicate, 🗑️ delete pages
- ✂️ Split by ranges like `1-3, 5, 8-10` — each range opens as a new tab,
  ready to review, edit, and export
- 📤 "Export PDF" always downloads the whole document (selection never gets
  in the way); "Export selection" and one-PDF-per-page ZIP cover the rest
- 🖨️ Print the edited document (Ctrl/⌘+P) — annotations and page edits
  included, straight to the browser's print dialog

**Editing & annotation** (flattened into the PDF on export)

- ✏️ **Edit existing text** — pick a real text run on the page and change the
  words; the original is covered in the sampled background color and the new
  text is baked in (in-place edit, no reflow — see limitations)
- 📝 Text boxes with inline editing, font size, and color
- ✍️ Signatures — draw with mouse/touch/pen or upload an image
- 🖼️ Image/stamp placement (PNG/JPEG)
- 🖊️ Freehand drawing, 🌕 highlight rectangles
- ⬛ Shapes: rectangle, ellipse, line, arrow — move, resize, restyle, delete
- ↩️ Undo/redo (100 steps) and keyboard shortcuts for everything (press `?`)

**UX**

- 🌓 Light / dark / auto theme, responsive layout down to phones
- ♿ Accessible controls: keyboard operable, labelled, WCAG-minded contrast
- 📊 Progress indicators for long exports, toast notifications

## Development

Requires Node ≥ 22 and [pnpm](https://pnpm.io) (`corepack enable` is the easiest way).

```bash
pnpm install
pnpm dev            # Rsbuild dev server with HMR
pnpm test           # unit + component tests (vitest)
pnpm test:coverage  # tests with coverage thresholds on core logic
pnpm build          # strict type-check + production build to dist/
pnpm preview        # serve the production build locally
pnpm lint           # eslint
pnpm format         # prettier
```

## Architecture

The code is organized into modules with strict boundaries; everything below
`ui/` is framework-free and unit-tested:

| Module                                  | Responsibility                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/pdf-core/`](src/pdf-core)         | Pure PDF logic: range parsing, page-plan operations, coordinate geometry, annotation model + validated (de)serialization, and the pdf-lib **assembler** that builds every output PDF |
| [`src/rendering/`](src/rendering)       | pdf.js loading and rendering: render service with a bounded queue, lazy thumbnails                                                                                                   |
| [`src/editor-state/`](src/editor-state) | zustand store built from pure reducer helpers: sources, pages, selection, annotations, snapshot-based undo/redo                                                                      |
| [`src/export/`](src/export)             | ZIP creation and local download helpers                                                                                                                                              |
| [`src/workers/`](src/workers)           | Export Web Worker + typed RPC client (falls back to the main thread when Workers are unavailable)                                                                                    |
| [`src/services/`](src/services)         | Async orchestration between store, rendering, and worker (open, insert, export, place images)                                                                                        |
| [`src/ui/`](src/ui)                     | React components: shell, toolbar, sidebar, canvas + SVG annotation overlay, properties panel, dialogs, toasts                                                                        |

### Design decisions

- **One assembler for everything.** Extract, split, merge, duplicate, rotate, and
  annotation flattening are all expressed as a _page plan_ (`{sourceId, sourceIndex,
rotation, annotations}[]`) fed to `assemblePdf()`. One heavily tested code path
  instead of five.
- **Pages are references, not copies.** Every open document (tab) is an array
  of `PageRef`s into immutable source PDFs shared across tabs. Reorder/delete/
  duplicate are cheap pure array operations, undo/redo is snapshot-based
  (structure sharing, no byte copies, capped at 100 steps per document), and
  splitting a document into tabs touches no PDF bytes at all — sources are
  released only when the last tab using them closes.
- **Display-space annotations.** Annotation geometry lives in "display space"
  (PDF points, origin top-left of the page as rendered, rotation applied). The
  mapping to PDF user space — including inherently rotated pages — is isolated in
  `pdf-core/geometry.ts` and mirrors pdf.js's viewport transform exactly, with
  unit tests for every rotation.
- **Heavy work off the main thread.** pdf.js parses/renders in its own worker;
  pdf-lib assembly and ZIP packing run in a dedicated export worker with progress
  reporting. Source bytes are copied and transferred, so the UI keeps ownership.
- **Lazy loading.** pdf.js loads on first file open, the export worker on first
  export — the initial page is ~80 kB gzipped.
- **Strict, serializable domain models.** All cross-boundary data (store ↔ worker)
  is plain structured-clone-safe data, validated on deserialization.

## Deployment

Every push to `main` runs lint, format check, tests with coverage, and the build,
then deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Pull requests get
the test job only.

The base path defaults to `/pdf-editor/` (the GitHub Pages URL). Override it for
other hosts with an environment variable at build time:

```bash
PUBLIC_BASE_PATH=/ pnpm build
```

> Note: if a Pages deployment fails transiently, trigger a fresh run
> (`gh workflow run deploy.yml`) instead of re-running the failed job — a re-run
> uploads a second `github-pages` artifact into the same run, which
> `actions/deploy-pages` rejects.

Dependency updates are automated with Dependabot (weekly, Monday mornings;
minor/patch updates grouped, `vitest`/`@vitest/*` always bumped together).

## Limitations

- **Encrypted PDFs are not supported.** Password-protected files are detected and
  rejected with a clear message — decrypt locally first (e.g. print/export from
  your PDF viewer).
- **Browser memory bounds document size.** Sources, undo history, and exports all
  live in RAM. Typical documents (hundreds of pages) are fine; multi-hundred-MB
  scans may struggle, especially on mobile. Thumbnails render lazily to keep
  memory in check.
- **Text annotations use Helvetica (WinAnsi).** Characters outside that encoding
  (e.g. CJK, emoji) are replaced with `?` on export — embedding full Unicode fonts
  would add megabytes to the bundle.
- **Annotations are flattened.** Exported annotations become regular page content,
  not editable PDF annotation objects.
- **Text editing is in-place, not reflowing.** Editing existing text detects
  the real text runs (via pdf.js), covers the original in the sampled
  background color, and draws the replacement on top. It works best for
  same-or-shorter edits on solid backgrounds; there is no reflow (widen the
  box for longer text), the cover color is approximate over images/gradients
  (adjustable), and the replacement is drawn in Helvetica since the original
  font/color are not reliably recoverable. Rotated text runs are skipped.
- Recent documents live in tab memory only — closing the tab forgets them (by design).

## License

[MIT](LICENSE) © vensas GmbH
