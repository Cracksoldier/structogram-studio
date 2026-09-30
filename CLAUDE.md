# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                         # Vite dev server
npm test -- --run                   # all unit tests once (Vitest; `npm test` = watch mode)
npx vitest run src/app/dsl          # tests under a path
npx vitest run -t "round-trips"     # tests matching a name
npm run typecheck                   # ngc strict template check (app) + tsc (specs) — `vite build` does NOT type-check templates
npm run build                       # production build → dist/
npm run preview                     # serve dist/
```

There is no linter. CI (`.github/workflows/deploy.yml`) runs typecheck → tests → build, then deploys `dist/` to GitHub Pages on pushes to `main`. The build reads `BASE_PATH` (CI sets `/<repo-name>/`). When testing a sub-path build from Git Bash on Windows, prefix `MSYS_NO_PATHCONV=1`, otherwise MSYS rewrites `/repo/` into a Windows path.

Angular 22 requires Node ≥ 22.22.3 or 24 (`.nvmrc` = 24).

## Stack

Angular 22 standalone components, signals, **zoneless** change detection (`provideZonelessChangeDetection` in `src/main.ts`; there is no zone.js). Vite compiles Angular via `@analogjs/vite-plugin-angular` (`vite.config.ts`), not the Angular CLI — there is no `angular.json`. The plugin uses `tsconfig.spec.json` in test mode and `tsconfig.app.json` otherwise. Tests run in the `node` environment and only cover pure TypeScript modules (no TestBed/DOM), so logic worth testing belongs in the pure layers below, not in components or the store.

## Architecture

Data flows one way through pure layers; only `services/` and `components/` touch Angular:

1. **Model** (`src/app/model/`): `Diagram { title, body: Block[] }`, where `Block` is a discriminated union on `kind` (`statement | call | exit | if | switch | while | doWhile | for`). `tree-ops.ts` addresses child lists with a `Slot { owner: blockId | null, branch }`. `branch` is `'body' | 'then' | 'else' | 'default' | 'case:<caseId>'`, and `slotKey()` turns a slot into a string key. All operations are immutable (structuredClone, then mutate) and return the **same** diagram object when nothing changes; the store relies on that identity to skip history entries. `validate.ts` is the gate for untrusted input (opened JSON files, localStorage).

2. **DSL** (`src/app/dsl/`): a line-based pseudo-code format. A block header ends with `{` and `}` sits on its own line. Comments are whole-line only (`#` or `//`), because `//` appears in real code. The parser and serializer must round-trip. Statement text that starts with a keyword gets quoted, and new keywords go in `KEYWORDS` in `parser.ts`. Parsing creates fresh ids, so `reconcileIds()` copies ids from the previous diagram by position and kind; that keeps the selection stable while typing. A test parses the README's syntax block, so keep the README accurate when the grammar changes.

3. **Layout** (`src/app/layout/`): two passes over the tree. `measure` works bottom-up (minimum sizes; text is wrapped at max widths), and `place` works top-down: a parent stretches its children to its width, and the last block in a list absorbs the extra height. The output is a flat list of `Prim`s (rect/poly/line/text) plus maps of `bounds`, `editBoxes` (for inline editing) and `slots` (empty-branch placeholders). Text is measured through a `TextMeasurer`: canvas in the browser, `approxMeasurer` in tests.

4. **Render** (`src/app/render/`): `svg-export.ts` serializes the same `Prim` list that the interactive canvas component renders, so the on-screen diagram and the export share one geometry. Colors come only from `palette.ts` (`DARK`, `LIGHT`). The UI chrome uses the CSS variables in `src/styles.css`.

5. **Store** (`services/diagram-store.ts`): a single signal-based source of truth for the diagram, selection, pseudo-code text, parse error, undo/redo stacks and zoom, with autosave to localStorage. Changes come in through two paths:
   - `commit(next)`: visual edits, undo/redo and loads. It re-serializes the diagram into `dslText` and bumps `externalRevision`.
   - `applyText(text)`: typing in the pseudo-code editor. It parses and reconciles ids; the text stays exactly as typed, and history entries are coalesced.

   The pseudo-code editor debounces its input, and it drops pending text if `externalRevision` changed in the meantime, so visual edits always win over unapplied typing. `layout` is a computed signal; it also depends on `fontEpoch`, so text is re-measured once web fonts load.

6. **Export** (`services/export.service.ts`): SVG with the Inter woff2 files inlined as data-URL `@font-face` rules. PNG is made by drawing that SVG as an image onto a canvas, so exported fonts match the screen.

Global keyboard shortcuts live in `app.component.ts`. They ignore events from inputs and textareas, and ignore Enter/Space on buttons. Font Awesome icons are imported individually in `src/app/icons.ts`.

## Conventions

- Line endings are LF (`.gitattributes`). On Windows, scripts that rewrite files must not convert them to CRLF.
