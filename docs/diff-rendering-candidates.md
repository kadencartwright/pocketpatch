# Diff Rendering Candidates

## Recommendation

Keep the current custom React renderer and evolve it toward a flattened row model when diff size requires virtualization.

PocketPatch needs mobile-friendly line tap targets, comments, dynamic row measurement, app-level search, and stable anchors. Owning the renderer is still simpler than adapting a high-level diff component.

Recommended next spike:

1. Normalize parsed files/hunks/lines into PocketPatch's own row model.
2. Render rows with React components inside one `@tanstack/react-virtual` scroller.
3. Add Shiki highlighting only for visible or near-visible rows.
4. Preserve current comment drawer, line anchors, and file collapse behavior.

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

- It is a renderer, not explicitly a virtualized row engine.
- Adapting its widget model may be more work than keeping PocketPatch's current renderer.

## Proposed Spike

Build a disposable diff viewer spike with the current structured daemon response and `@tanstack/react-virtual`.

Success criteria:

- Renders a 50k-line synthetic diff without freezing mobile Safari.
- Supports line tap targets and a 16px comment textarea.
- Preserves scroll position while opening/closing comments.
- Can jump to a file, hunk, comment, or search result.
- Can render staged and unstaged diffs from raw `git diff` output.
