# Diff Rendering Candidates

## Recommendation

Start with a parser-first/custom-renderer prototype using `@tanstack/svelte-virtual`, Shiki, and a unified diff parser.

The current app direction is SvelteKit + Svelte 5, so React diff components are no longer primary candidates for the main renderer. PocketPatch also needs one flattened virtualized row model for mobile, comments, dynamic row measurement, and app-level search. Owning the renderer is likely simpler than adapting a high-level diff component.

Recommended spike:

1. Parse raw `git diff` output with `parse-diff`, `parse-git-diff`, or `gitdiff-parser`.
2. Normalize parsed files/hunks/lines into PocketPatch's own row model.
3. Render rows with Svelte components inside one `@tanstack/svelte-virtual` scroller.
4. Add Shiki highlighting only for visible or near-visible rows.
5. Treat React diff renderers as references, not dependencies, unless the UI stack changes back to React.

Key risk: parser coverage for rename, binary, mode, staged, unstaged, and untracked-file cases.

## Candidate: `react-diff-view`

Links:

- https://www.npmjs.com/package/react-diff-view
- https://github.com/otakustay/react-diff-view

Pros:

- React-native API.
- Consumes git unified diff output.
- Supports unified and split views.
- Has widget architecture intended for code comments.
- Has customization hooks for gutter, code render, events, and styles.
- Includes token/highlighting pipeline that can run in a web worker.
- Mentions collapsed code expansion, code comments, and large diff lazy loading in its demo.
- Current npm metadata checked on 2026-05-29: `3.3.3`, modified 2026-03-30, MIT.

Cons:

- React-specific, while PocketPatch's current UI direction is Svelte.
- It is a renderer, not explicitly a virtualized row engine.
- We would need to port concepts or wrap awkwardly rather than use it directly.
- Existing styles may need substantial mobile tuning.

Prototype questions:

- Can a diff be flattened into rows while still using its types, parser, and line utilities?
- Can comments render inline without causing awkward dynamic measurement?
- Can syntax tokenization be scoped to visible or near-visible rows?
- Can file and hunk headers be rendered as independent virtual rows?

## Candidate: `@pierre/diffs`

Links:

- https://diffs.com/
- https://diffs.com/docs

Pros:

- Very current and visually polished.
- Built on Shiki.
- Supports stacked and split layouts.
- Has React components.
- Provides an annotation framework for comments and CI-style notes.
- Uses Shadow DOM and CSS Grid, with fewer DOM nodes as an explicit design goal.
- Current npm metadata checked on 2026-05-29: `1.2.4`, modified 2026-05-28, Apache-2.0.

Cons:

- The documented component path is not Svelte-native.
- Shadow DOM and high-level rendering may make tight integration with our own virtualizer harder.
- The docs lean toward rendering whole file diffs, not exposing a flat row model.
- Less battle-tested than older packages.
- Apache-2.0 is fine for most projects but not as frictionless as MIT if license simplicity matters.

Prototype questions:

- Can individual rows or hunks be rendered independently?
- Can comments be anchored to our own line/comment model rather than the library's internal model?
- Does Shadow DOM complicate mobile styling, measurement, or accessibility?
- Is syntax highlighting cacheable/chunkable enough for huge diffs?

## Candidate: `diff2html`

Links:

- https://www.npmjs.com/package/diff2html
- https://diff2html.xyz/

Pros:

- Mature git/unified diff to HTML library.
- Supports line-by-line and side-by-side views.
- Includes file lists, line numbers, inserted/removed lines, line matching, and syntax highlighting.
- Can be used either through a UI wrapper or through parser/HTML generator APIs.
- Current npm metadata checked on 2026-05-29: `3.4.56`, modified 2026-01-31, MIT.

Cons:

- HTML generation is less natural for Svelte state, comments, and virtualized rows.
- Styling and event ownership can get awkward if we inject generated HTML.
- Better fit for static previews than an interactive mobile review surface.

Best use:

- Good fallback for exporting static HTML review artifacts.
- Possible source of parser/formatting ideas, but not the ideal main renderer.

## Candidate: `react-diff-viewer`

Links:

- https://www.npmjs.com/package/react-diff-viewer
- https://github.com/praneshr/react-diff-viewer

Pros:

- Simple React component.
- Supports split and unified views.
- Supports line highlighting, word diff, and custom code rendering.
- MIT licensed.

Cons:

- React-specific, while PocketPatch's current UI direction is Svelte.
- Current npm metadata checked on 2026-05-29: `3.1.1`, last modified 2022-05-14.
- Takes old/new strings rather than primarily consuming git patch structure.
- Less suitable for worktree-scale git diffs with many files, comments, and virtualization.

Best use:

- Not recommended for PocketPatch unless prototyping an isolated two-string diff.

## Candidate: Monaco Diff Editor

Links:

- https://microsoft.github.io/monaco-editor/
- https://www.npmjs.com/package/@monaco-editor/react

Pros:

- Excellent editor-grade syntax highlighting and diff behavior.
- Strong for comparing two complete files.
- Familiar interactions for developers.

Cons:

- Heavy for mobile.
- Not designed around git patch hunks across many files.
- Comment anchoring and agent-review packet output would be custom anyway.
- Virtualizing many changed files inside Monaco is the wrong abstraction.

Best use:

- Later optional "open file diff" mode for a single file, not the main mobile review UI.

## Parser-Only Options

These are useful if PocketPatch owns rendering.

### `parse-diff`

- https://www.npmjs.com/package/parse-diff
- Current npm metadata checked on 2026-05-29: `0.12.0`, modified 2026-04-17, MIT.
- Simple unified diff parser.
- Good candidate if we want a small parser and our own typed normalization layer.

### `parse-git-diff`

- https://www.npmjs.com/package/parse-git-diff
- Current npm metadata checked on 2026-05-29: `0.0.20`, modified 2026-02-14, MIT.
- Parses git diffs into an AST-like format.
- Worth comparing against `parse-diff` for rename/binary/mode coverage.

### `gitdiff-parser`

- https://www.npmjs.com/package/gitdiff-parser
- Current npm metadata checked on 2026-05-29: `0.3.1`, modified 2023-03-14, MIT.
- Used by `react-diff-view`.
- Small and direct, but less recently updated as a standalone package.

## Proposed Spike

Build a disposable diff viewer spike with two branches:

1. `parse-diff` or `parse-git-diff` plus a custom flattened Svelte virtual row renderer.
2. `gitdiff-parser` plus the same renderer, to compare parser coverage and ergonomics.

Success criteria:

- Renders a 50k-line synthetic diff without freezing mobile Safari.
- Supports line tap targets and a 16px comment textarea.
- Preserves scroll position while opening/closing comments.
- Can jump to a file, hunk, comment, or search result.
- Can render staged and unstaged diffs from raw `git diff` output.

If both are awkward, use a parser-only package and own the renderer from the start.
