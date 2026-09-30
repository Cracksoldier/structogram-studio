# Structogram Studio

A client-side Nassi–Shneiderman (structogram) diagram editor built with **Angular 22** and **Vite**.
Everything runs in the browser: no backend, diagrams are autosaved to `localStorage`.

## Features

- Visual editing: click to select, double-click (or `F2`) to edit text in place, insert blocks from the toolbar or with keys `1`–`8`
- Pseudo-code pane kept in sync with the diagram in both directions, with line-numbered parse errors
- Blocks: statement, call, exit/return, if/else (incl. `else if`), switch/case/default, while, for, do-while
- Undo/redo, cut/copy/paste/duplicate, move up/down, zoom & fit
- Export to **PNG** (1×/2×/3×) and **SVG**, in dark or light (print) theme, optionally transparent; fonts are embedded so exports look the same everywhere
- Save/open diagrams as JSON or `.nsd` pseudo-code

## Development

```bash
npm install
# Vite dev server
npm run dev
# Vitest (watch); `npm test -- --run` for a single run
npm test
# strict Angular template + TS check
npm run typecheck
# production build into dist/
npm run build
# serve dist/
npm run preview
```

Requires Node 22.22+ or 24 (see `.nvmrc`).

The Angular compiler is integrated into Vite through
[`@analogjs/vite-plugin-angular`](https://www.npmjs.com/package/@analogjs/vite-plugin-angular); see `vite.config.ts`.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` type-checks, tests and builds on every push/PR to `main`, and deploys `dist/` to GitHub Pages on pushes to `main`.

One-time setup: in the repository go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.

The workflow sets `BASE_PATH=/<repo-name>/` so assets resolve under the project-pages URL. For a user/organization page or a custom domain, change it to `/`.

## Pseudo-code syntax

```
title "My algorithm"

# plain line = statement
read n
# sub-procedure call
call init(n)
# exit / return / break
exit return result
# lines starting with return/break/continue are exits too
return x

if n > 0 {
  print "positive"
} else if n < 0 {
  print "negative"
} else {
  print "zero"
}

switch op {
  case + {
    r := a + b
  }
  default {
    error
  }
}

# pre-test loop
while i < n {
  i := i + 1
}

for i := 1 to n {
  sum := sum + i
}

# post-test loop
do {
  read x
} while x < 0
```

- A block opens with `{` at the end of a line and closes with `}` on its own line.
- Wrap text in `"quotes"` if it starts with a keyword (`"if this is just text"`).
- Lines starting with `#` or `//` are comments.

## Project layout

```
src/app/model/       diagram types, immutable tree operations
src/app/dsl/         pseudo-code parser, serializer, id reconciliation
src/app/layout/      text measuring + Nassi–Shneiderman layout → drawing primitives
src/app/render/      palettes and standalone SVG serializer (used for export)
src/app/services/    signal-based store (undo/redo, autosave), export service
src/app/components/  toolbar, diagram canvas, pseudo-code editor, inspector, help
```
