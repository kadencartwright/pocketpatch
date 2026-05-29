# PocketPatch Design Draft

## Product Shape

PocketPatch is a local, mobile-first review surface for agent-generated git diffs. The primary entrypoint is an agent-facing CLI that talks to a local daemon.

The core loop:

1. An agent runs the PocketPatch CLI from its current working directory.
2. The CLI registers that directory as a review target with the local daemon.
3. The daemon returns a scoped review URL.
4. The human opens the URL from a phone and reviews that one target's current diff.
5. The human leaves line-level comments.
6. The agent runs the CLI again to read unresolved feedback for its current directory.

The first version should optimize for a single trusted user reviewing local work from a phone on the same network or through a private tunnel.

This removes the need for v1 project discovery, recursive repository search, and global worktree inventory. Git operations are scoped to directories explicitly registered by an agent.

## Framework Recommendation

Current leaning: Effect for the CLI and daemon, with SvelteKit + Svelte 5 served by the daemon for the phone review UI.

See `docs/stack-options.md` for the stack comparison. The earlier TanStack Start/React direction remains viable, but it is no longer the primary plan.

Why Effect + SvelteKit fits:

- Effect can own the stable agent-facing CLI, daemon lifecycle, daemon API, git execution, persistence, typed errors, and testable services.
- SvelteKit file-based routing is enough for the small phone UI.
- SvelteKit server-only modules can keep git and filesystem access out of browser bundles.
- Vite should keep local development fast.
- Svelte should be a useful experiment for a dense mobile UI with less client framework ceremony.

Initial stack:

- SvelteKit
- Svelte 5
- TypeScript
- Effect
- `@effect/platform-node`
- `@tanstack/svelte-virtual`
- SQLite for local app state, stored in an XDG user-scoped state directory
- Direct `git` subprocess calls through an Effect service
- Shiki for syntax highlighting, loaded lazily per language/theme
- CSS modules or Tailwind, depending on scaffold friction

## Views

### Review URL

Purpose: show and review one registered target from a scoped URL.

Primary content:

- Working directory path
- Repository root, if the directory is inside a git repository
- Current branch/ref
- Dirty state summary
- Changed-file list
- Virtualized diff
- Comment markers and editor
- Feedback/export state

Actions:

- Refresh target
- Add comment
- Resolve comment
- Copy review URL
- Copy/export feedback packet

V1 does not need a dashboard or global active-review browser. A small daemon status page can be added later if useful.

### CLI Register Target

Purpose: create or refresh a review target from the CLI.

Initial command shape:

```sh
pocketpatch review
```

Behavior:

- Resolve the current working directory.
- Detect the enclosing git repository if one exists.
- Register or refresh a daemon-side review target keyed by normalized path.
- Return a URL scoped to that target.
- Optionally print a short status summary for the agent.

Possible output:

```text
PocketPatch review ready:
http://100.x.y.z:3217/r/abc123?token=...
```

### Diff View

Purpose: review the current changes in one registered working directory.

Primary content:

- Sticky compact header with path, branch/ref, and dirty summary
- File list with changed-file status
- Diff viewer
- Comment drawer or inline composer
- Review packet/export action

Diff modes:

- Unified diff as the first implementation.
- Split diff later if mobile ergonomics prove workable.

Diff scopes:

- Unstaged changes
- Staged changes
- Untracked files, rendered as "new file" where practical
- Later: compare against a selected base ref

Mobile behavior:

- Single-column layout.
- File list collapses into a drawer or segmented tab.
- Sticky file/hunk context while scrolling.
- Tap a changed line to open the comment composer.
- Existing comments appear as compact markers that expand on tap.

### Comment Review / Export

Purpose: let the reviewer inspect all notes, and let the agent retrieve them through the CLI.

Primary content:

- Comments grouped by file and hunk
- Resolved/unresolved state
- Copy/export command
- Raw Markdown packet preview

The export should be deterministic and text-first so it can be read by the CLI, pasted into a Codex session, or used by a skill.

## Git Model

### Review Target

A review target represents one registered working directory. It may be a git repository root, a subdirectory inside a repository, or a standalone directory. Git-aware review requires the target to be inside a git repository.

Stored fields:

- `id`
- `tokenHash`
- `workingDirectory`
- `repoRoot`, nullable
- `gitCommonDir`, nullable
- `branch`
- `head`
- `addedAt`
- `lastRegisteredAt`
- `lastViewedAt`
- `lastTouchedAt`
- `dirtySummary`

Ref display:

- Prefer symbolic branch name.
- For detached HEAD, show short commit plus any useful nearby ref if cheap to resolve.

### Last Touched

Use a pragmatic derived timestamp:

1. If there are changed tracked files, use the newest mtime among changed files.
2. Include untracked files, excluding ignored files and heavy directories.
3. Fall back to HEAD commit time.
4. Fall back to working directory mtime.

This makes active agent targets float to the top even when branch names are stale or reused.

### Diff Data

Initial commands:

```sh
git -C <target> status --porcelain=v2 --branch
git -C <target> diff --no-ext-diff --find-renames
git -C <target> diff --cached --no-ext-diff --find-renames
```

Implementation notes:

- Parse structured status where possible.
- Parse unified diffs into files, hunks, and lines.
- Treat binary files as file-level changes only.
- Cap very large files/diffs and provide a "load full diff" action later.
- Keep subprocess execution on the daemon with strict path validation against registered target roots.

## Comments

Comments need to survive reasonable diff churn without pretending to be a full code review platform.

Store comment anchors with:

- `targetId`
- `workingDirectory`
- `baseHead`
- `filePath`
- `side`: old, new, or file
- `lineNumber`
- `hunkHeader`
- `hunkHash`
- `lineText`
- `body`
- `status`: open or resolved
- `createdAt`
- `updatedAt`

Matching strategy when diffs change:

- First match by file path, side, and line number.
- If that fails, match by hunk hash.
- If that fails, fuzzy match nearby line text in the same file.
- If still unmatched, show as outdated but keep it visible in export.

## Agent Feedback Loop

First version: CLI commands backed by daemon state.

Example command shape:

```sh
pocketpatch review
pocketpatch feedback
pocketpatch feedback --format markdown
```

`pocketpatch review`:

- Registers the current working directory.
- Starts the daemon if needed.
- Returns a scoped review URL.

`pocketpatch feedback`:

- Resolves the current working directory.
- Fetches unresolved comments for the matching review target.
- Prints deterministic text for the agent.
- Exits nonzero if feedback exists only if that proves useful for automation.

The feedback packet should include:

- Repository path
- Working directory
- Current branch/ref and HEAD
- Review timestamp
- Comments grouped by file
- For each comment: line anchor, code excerpt, reviewer note
- Clear instruction: address these comments and report back with changes

Possible Codex integration:

- Add a PocketPatch skill that tells the agent to run `pocketpatch review` before human review and `pocketpatch feedback` after review.
- Keep the skill thin; the CLI owns the protocol and formatting.
- Later: add richer command flags for selecting review targets or marking comments addressed.

The CLI route is the least magical and easiest for agents to use reliably.

## Mobile UI Constraints

iOS Safari zooms focused inputs below 16px. All form controls, including inline comment textareas, should use at least `16px` font size.

Baseline interaction sizes:

- Inputs and textareas: minimum `16px`
- Tappable controls: minimum 44px hit target
- Diff body text: likely 14-15px for code, but comment inputs remain 16px
- Use horizontal scroll for code rather than shrinking text aggressively
- Avoid dense side-by-side controls on phones

Diff readability:

- Use a code font with clear punctuation and line-number alignment.
- Keep line numbers tappable but not the only tap target.
- Use restrained syntax highlighting so added/removed backgrounds remain legible.
- Provide per-file collapse controls.
- Preserve whitespace and long lines.

## Diff Virtualization

Diff virtualization is a v1 requirement. Agent diffs can be large enough that rendering every file, hunk, line, syntax token, and comment marker at once would make mobile review unusable.

Use `@tanstack/svelte-virtual` for the main diff scroller.

Initial rendering model:

- Flatten the selected diff into a single ordered list of render rows.
- Row types include file header, hunk header, code line, comment marker, comment editor, collapsed block, binary-file notice, and oversized-file notice.
- Virtualize that flattened list instead of virtualizing each file independently.
- Keep file and hunk metadata on each row so sticky context and comment anchors are cheap to derive.
- Use stable row keys based on file path, hunk identity, side, and line number rather than array indexes.

Why a single virtualized list:

- Scroll position is easier to preserve.
- Sticky file context is easier to compute.
- Comments can expand inline without coordinating nested virtualizers.
- Mobile browser memory stays bounded even across many changed files.

Sizing strategy:

- Most code rows can use a fixed estimated height.
- Comment editors, wrapped comments, file headers, and oversized notices need dynamic measurement.
- Long code lines should scroll horizontally instead of wrapping by default, which keeps row height predictable.
- If we later add a wrapped-code mode, it should be a per-view option because it makes row heights more variable.

Large diff safeguards:

- Parse full diff metadata server-side, but page or chunk huge patch text where needed.
- Put a row-count and byte-size cap on automatic syntax highlighting.
- Highlight visible rows lazily, with cached tokenization by file/language/content hash.
- Collapse generated or very large files by default.
- Preserve scroll offset and virtualizer measurements when navigating between file list, comments, and diff view.

Keyboard/search implications:

- Browser find may not see non-rendered lines.
- Provide an app-level file/hunk/comment search instead of relying only on native find.
- Search results should jump through the virtualizer to the matching row.

## Security Model

PocketPatch can read local source code and run git commands, so the default posture should be local and private.

Initial assumptions:

- Bind to a configured IP address for phone review, normally the host's Tailscale IP.
- Each review URL carries a scoped unguessable token.
- If network access is enabled for phone review, require that scoped token.
- Do not expose arbitrary path browsing.
- Resolve symlinks and validate every requested path against a registered target.
- Never accept a client-supplied command.
- Run only a small allowlist of git operations.

Phone access should be Tailscale-first. The daemon should bind to a configured IP address rather than broadly listening on all interfaces.

Network configuration:

- Store the selected bind IP address in the XDG config file.
- Support listing available local addresses from the CLI, grouped by interface name.
- Support setting the bind address from the CLI.
- Prefer the Tailscale address for the user's setup.
- Still require scoped review tokens in URLs.
- Avoid binding to `0.0.0.0` by default.

Initial CLI shape:

```sh
pocketpatch config addresses
pocketpatch config set-bind-address 100.x.y.z
pocketpatch config show
```

Possible config shape:

```json
{
  "network": {
    "bindAddress": "100.x.y.z",
    "port": 3217
  }
}
```

The CLI should list actual local interfaces and addresses so the user can identify the Tailscale IP address. On many Linux systems the interface name may be `tailscale0`, but the persisted daemon binding should be the concrete IP address, not the interface name.

## Local Storage

Follow the XDG Base Directory Specification for user-scoped files. Do not write app state directly under the home directory.

Default Linux paths:

- State database: `${XDG_STATE_HOME:-$HOME/.local/state}/pocketpatch/pocketpatch.db`
- Runtime socket/pid files: `${XDG_RUNTIME_DIR}/pocketpatch/` when available
- Config file: `${XDG_CONFIG_HOME:-$HOME/.config}/pocketpatch/config.json`
- Cache files: `${XDG_CACHE_HOME:-$HOME/.cache}/pocketpatch/`

State should contain durable review targets, comments, tokens, and daemon metadata.

Cache should contain derived or disposable artifacts like syntax highlighting caches and large diff chunk caches.

Runtime should contain active daemon connection material where the platform provides an appropriate runtime directory.

## Initial Milestones

### Milestone 1: Local Read-Only Review

- Scaffold SvelteKit app and Effect daemon/CLI package.
- Add `pocketpatch review`.
- Add `pocketpatch config addresses` and `pocketpatch config set-bind-address`.
- Auto-start or connect to local daemon.
- Register current working directory as a review target.
- Return scoped review URL.
- Render unstaged/staged diffs with virtualized rows and syntax highlighting.

### Milestone 2: Comments

- Add line-level comment creation.
- Persist comments in SQLite.
- Show comments in diff view.
- Handle basic stale anchors.

### Milestone 3: Agent Handoff

- Add `pocketpatch feedback`.
- Add review packet export.
- Add initial Codex skill instructions.

### Milestone 4: Polish

- Better mobile navigation.
- Comment resolution workflow.
- Optional live refresh/polling.
- Authentication and Tailscale/network access hardening.

## Decisions To Review

- SvelteKit UI embedded in the daemon vs a simpler Vite/Svelte UI served as static assets.
- SQLite app state vs flat JSON files in XDG user-scoped state/config directories.
- Unified-only diff for v1 vs early split diff support.
- Direct `git` subprocesses vs a git library wrapper.
- Tailscale bind-address token auth vs localhost-only fallback behavior.
- Whether large diff text should be fully loaded into memory in v1 or streamed/chunked earlier.
- Whether the daemon and web UI should be one process or two coordinated processes.
