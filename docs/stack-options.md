# Stack Options

## Current Direction

Use Effect for the CLI plus local daemon, with a Vite React app in `apps/web` for the phone review UI.

This keeps the product CLI-first. The agent already knows the current working directory, so the CLI registers exactly that directory and returns a scoped review URL. PocketPatch does not need repository discovery, recursive worktree search, or a dashboard-first project inventory for v1.

Recommended shape:

```text
Agent skill
  -> pocketpatch CLI
  -> local daemon API
  -> Effect services
  -> registered target state, git subprocesses, XDG-scoped SQLite
  -> scoped React review URL
```

Effect should own:

- CLI command model
- Daemon lifecycle
- Local daemon API
- Review target registration
- Git command execution
- Diff parsing and normalization
- Comment persistence
- Review feedback export
- Local address discovery and bind-address configuration
- Structured errors, concurrency limits, logging, and test layers

The React app should own:

- Phone review routing
- Diff and comment UI
- Local workflow state
- Server-state caching and mutation invalidation through TanStack Query
- Mobile interaction details

The client should stay out of Effect. Browser server state belongs in TanStack Query; local workflow intent belongs in React state or reducers.

## Primary Flow

### Register For Review

The agent runs:

```sh
pocketpatch register
```

The CLI:

1. Resolves `process.cwd()` to a real path.
2. Starts or connects to the daemon.
3. Registers the current directory as a review target.
4. Detects git metadata for that target only.
5. Receives a scoped URL.
6. Prints the URL for the human reviewer.

### Retrieve Feedback

After review, the agent runs:

```sh
pocketpatch comments
```

The CLI:

1. Resolves `process.cwd()`.
2. Reads the local state database.
3. Finds the matching registered project.
4. Prints unresolved comments in deterministic text.

## Client Stack

Use:

- React
- TypeScript
- Vite
- TanStack Router
- TanStack Query
- Shiki for syntax highlighting
- Tailwind CSS

## Local Storage

Use XDG user-scoped directories for durable state, config, cache, and runtime files. Avoid writing a top-level dot directory directly under `$HOME`.

Default Linux paths:

- State database: `${XDG_STATE_HOME:-$HOME/.local/state}/pocketpatch/pocketpatch.db`
- Config file: `${XDG_CONFIG_HOME:-$HOME/.config}/pocketpatch/config.json`
- Cache files: `${XDG_CACHE_HOME:-$HOME/.cache}/pocketpatch/`
- Runtime socket/pid files: `${XDG_RUNTIME_DIR}/pocketpatch/` when available

Network config belongs in config, for example:

```json
{
  "network": {
    "bindAddress": "100.x.y.z",
    "port": 3217
  }
}
```

## Diff Rendering

The current implementation renders parsed structured diffs directly in React.

Near-term improvements:

- Flatten diff rows into a single ordered render model.
- Add `@tanstack/react-virtual` when large diffs make full rendering too expensive.
- Keep file and hunk metadata on each row so sticky context and comment anchors are cheap to derive.
- Cache syntax highlighting by file/language/content hash.
- Collapse generated or very large files by default.

## Open Questions

- Should `pocketpatch register` auto-start the daemon or require `pocketpatch daemon start`?
- Should feedback output default to text, Markdown, JSON, or multiple formats?
- Should non-Linux platforms use native app directories or XDG-compatible environment variables only?
- Should there be a convenience command that auto-selects the current Tailscale IP address?
- Should the daemon eventually serve the built web assets directly, or should dev/prod stay as separate coordinated processes?
