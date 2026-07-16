---
name: verify
description: Build, launch, and drive the PDF editor to verify changes end-to-end in a real browser.
---

# Verifying changes in the PDF editor

Browser SPA (Rsbuild + React). No server; everything runs client-side.

## Launch

```bash
pnpm dev          # port 3000 is usually taken locally → rsbuild falls back to 3001
                  # (PORT env var is ignored; read the startup log for the real port)
```

## Drive (Playwright)

Playwright browsers are already cached in `~/Library/Caches/ms-playwright` —
`npm install playwright@latest` in a scratch dir matches the cached Chromium
(older pins may want a missing revision).

Recipe that works:

1. Generate a source PDF with the project's own `pdf-lib` (load it via
   `createRequire('<repo>/package.json')` — its ESM build has extensionless
   imports that break under plain node).
2. `page.setInputFiles('input[type="file"][accept*="pdf"]', src)` feeds the
   toolbar's hidden "Merge PDF" input; no dialog needed.
3. Wait for `svg[aria-label="Annotations"]`, then drive tools via their
   toolbar buttons (`button[aria-label="<Label> tool"]`) and `page.mouse` on
   the svg's bounding box.
4. Inline editors: `.text-annotation-editor` (plain text textarea),
   `.rich-text-editor .ProseMirror` (Tiptap). Pause ~250ms after the editor
   appears before typing — focus lands on a rAF, and an instant first
   keystroke can be swallowed (and may hit a global tool shortcut).
5. Export: `waitForEvent('download')` + click `button:has-text("Export PDF")`.

## Checking exported PDFs

pdf-lib writes compressed object streams — grepping raw bytes for font names
or text fails. Load with pdf-lib, read page `Resources` → `Font` →
`BaseFont`, and inflate the content streams (`zlib.inflateSync`) to see the
operators; text appears hex-encoded (`<48656C6C6F> Tj`).
