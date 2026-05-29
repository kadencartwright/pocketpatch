# Stack Options

## Recommendation

Use Effect for a CLI plus local daemon, with SvelteKit + Svelte 5 served by the daemon for the phone review UI.

This is simpler than a project browser/dashboard-first app. The agent already knows the current working directory, so the CLI can register exactly that directory and return a scoped URL. PocketPatch does not need to discover repositories, recurse through worktrees, or maintain a global project inventory in v1.

Recommended shape:

```text
Agent skill
  -> pocketpatch CLI
  -> local daemon API
  -> Effect services
  -> registered target state, git subprocesses, XDG-scoped SQLite
  -> scoped SvelteKit review URL
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
- Access token generation and validation
- Local address discovery and bind-address configuration
- Structured errors, concurrency limits, logging, and test layers

SvelteKit should own:

- Phone review routes and layouts
- The active review UI
- Diff/comment endpoints if hosted inside the daemon process
- Mobile interaction details

The client should not use Effect initially. Svelte's built-in reactivity and stores are a better first fit for UI state.

## Primary Flow

### Register For Review

The agent runs:

```sh
pocketpatch review
```

The CLI:

1. Resolves `process.cwd()` to a real path.
2. Starts or connects to the daemon.
3. Registers the current directory as a review target.
4. Detects git metadata for that target only.
5. Receives a scoped token and URL.
6. Prints the URL for the human reviewer.

### Retrieve Feedback

After review, the agent runs:

```sh
pocketpatch feedback
```

The CLI:

1. Resolves `process.cwd()`.
2. Connects to the daemon.
3. Finds the matching review target.
4. Prints unresolved comments in deterministic Markdown or JSON.

This keeps the agent integration trivial enough to document in a skill:

```text
Before asking for human review, run `pocketpatch review` from the repo or worktree you are editing.
After the human reviews, run `pocketpatch feedback` and address every unresolved comment.
```

### Configure Phone Access

The user's expected phone path is Tailscale. The daemon should bind to a configured IP address, not to every network interface by default.

Initial CLI surface:

```sh
pocketpatch config addresses
pocketpatch config set-bind-address 100.x.y.z
pocketpatch config show
```

`pocketpatch config addresses` should list local interfaces and addresses so the user can identify the Tailscale IP address on their system. The selected bind address should be stored in the XDG config file and used directly when the daemon starts.

## Why SvelteKit Still Works Here

PocketPatch still needs a polished mobile UI. SvelteKit is a reasonable way to serve that UI from the local daemon without building routing and bundling from scratch.

Relevant SvelteKit features:

- `+page.server.ts` for data that must only run on the server.
- `+server.ts` endpoints for JSON actions like add comment, refresh the registered target, export review packet, and fetch diff chunks.
- `$lib/server` and `.server.ts` modules to prevent accidental server code imports into browser bundles.
- `@sveltejs/adapter-node` for a standalone local Node server.

Remote functions are worth watching, but not the default first implementation. They are currently still behind SvelteKit's experimental config and can change without semantic-version guarantees.

## Effect Integration Pattern

Keep one Effect runtime for the daemon and expose a small adapter at CLI and SvelteKit boundaries.

Example target shape:

```ts
// src/lib/server/effect-runtime.ts
import { Effect, Layer, ManagedRuntime } from "effect";

const AppLayer = Layer.mergeAll(
  GitService.Live,
  TargetStore.Live,
  CommentStore.Live,
  DiffService.Live,
  TokenService.Live
);

const Runtime = ManagedRuntime.make(AppLayer);

export const runEffect = <A, E>(program: Effect.Effect<A, E>) =>
  Runtime.runPromise(program);
```

Then the CLI stays thin:

```ts
// src/cli/review.ts
import { runEffect } from "../daemon/effect-runtime";
import { ReviewTarget } from "../daemon/services/review-target";

export const review = async (cwd: string) =>
  runEffect(ReviewTarget.register({ cwd }));
```

SvelteKit route files should also stay thin, adapting typed Effect errors to SvelteKit `error`, `redirect`, or JSON responses in one helper.

## Effect Packages To Consider

Core:

- `effect`
- `@effect/platform`
- `@effect/platform-node`

Likely useful:

- `@effect/cli`
- `@effect/sql`
- `@effect/sql-sqlite-node`
- `@effect/rpc` only if we later want an Effect-native typed API boundary

Avoid depending on community Svelte/Effect adapters for v1 unless a spike proves one is mature enough. The current adapters are interesting, but a local wrapper around `ManagedRuntime.runPromise` is simple, auditable, and avoids adopting another abstraction while both SvelteKit remote functions and Effect 4 adapters are moving.

## Client Stack

Use:

- Svelte 5
- TypeScript
- `@tanstack/svelte-virtual`
- Shiki, with lazy/highlight-on-demand behavior
- A lightweight Svelte store for local view state

Do not add a client data-fetching library by default. SvelteKit page data, explicit fetch calls to daemon endpoints, and invalidation should be enough for the early app. Add TanStack Query for Svelte only if polling, caching, or request deduplication gets messy.

## Local Storage

Use XDG user-scoped directories for durable state, config, cache, and runtime files. Avoid writing a top-level dot directory directly under `$HOME`.

Default Linux paths:

- State database: `${XDG_STATE_HOME:-$HOME/.local/state}/pocketpatch/pocketpatch.db`
- Config file: `${XDG_CONFIG_HOME:-$HOME/.config}/pocketpatch/config.json`
- Cache files: `${XDG_CACHE_HOME:-$HOME/.cache}/pocketpatch/`
- Runtime socket/pid files: `${XDG_RUNTIME_DIR}/pocketpatch/` when available

Durable review targets, comments, token hashes, and daemon metadata belong in state. Derived syntax highlighting caches and diff chunk caches belong in cache. Daemon sockets and pid files belong in runtime when the platform provides it.

Network config belongs in config, for example:

```json
{
  "network": {
    "bindAddress": "100.x.y.z",
    "port": 3217
  }
}
```

## Diff Virtualization

Svelte does not change the core rendering plan:

- Flatten each selected diff into render rows.
- Use one `@tanstack/svelte-virtual` scroller.
- Render rows as Svelte components.
- Keep comments and editors as dynamic-height rows.
- Cache syntax highlighting by file/language/content hash.

This keeps the most important performance design independent of whether the UI is React or Svelte.

## Architecture Options

### Option A: Effect CLI + Daemon + SvelteKit UI

Use Effect as the primary runtime boundary. The CLI talks to a local daemon, and the daemon serves the SvelteKit phone UI.

Pros:

- Matches the agent-skill entrypoint.
- No project/worktree discovery required for v1.
- Review URLs are naturally scoped to one registered target.
- Daemon state is shared between phone UI and agent CLI.
- Keeps filesystem/git behavior in Effect.

Cons:

- Slightly more daemon lifecycle work.
- Need to decide how SvelteKit is embedded or served by the daemon in dev/prod.
- The CLI/daemon protocol needs versioning once installed globally.

Verdict: recommended for v1.

### Option B: SvelteKit App With Effect Services

Use SvelteKit as the only HTTP server. Use Effect inside server modules.

Pros:

- One server.
- No daemon lifecycle.
- Easy SvelteKit path.

Cons:

- Less aligned with the CLI-first agent workflow.
- Harder to make the CLI the stable integration boundary.
- More temptation to rebuild dashboard/project discovery.

Verdict: viable, but less aligned with the simplified product.

### Option C: Svelte SPA + Effect Node API

Use plain Vite/Svelte for the client and a separate Effect Node server for everything else.

Pros:

- Very explicit frontend/backend split.
- No SvelteKit conventions to learn.

Cons:

- We would rebuild routing, endpoint integration, SSR decisions, and deployment structure ourselves.
- Less ergonomic for local full-stack iteration.

Verdict: not recommended unless embedding SvelteKit in the daemon proves awkward.

### Option D: TanStack Start + React + Effect

Use the earlier React direction and call Effect from server functions/API routes.

Pros:

- Strong React ecosystem.
- Known path for `@tanstack/react-virtual`.
- More React diff libraries are available.

Cons:

- Does not satisfy the Svelte experiment goal.
- More client-framework code for the same local tool.

Verdict: still viable, but no longer the primary direction.

## Open Questions

- Do we want to adopt SvelteKit remote functions despite their experimental status?
- Should SQLite access use Effect SQL from the start, or a simpler driver behind an Effect service?
- Should the CLI and daemon live in one package or separate workspace packages?
- How much of the diff parser/highlighter should run server-side vs client-side?
- Is Tailscale phone access handled by SvelteKit hooks middleware or an Effect-authenticated service wrapper?
- Should `pocketpatch review` auto-start the daemon or require `pocketpatch daemon start`?
- Should feedback output default to Markdown, JSON, or both?
- Should non-Linux platforms use native app directories or XDG-compatible environment variables only?
- Should there be a convenience command that auto-selects the current Tailscale IP address?

## Package Metadata Checked

Checked on 2026-05-29:

- `svelte`: `5.55.10`, MIT, modified 2026-05-27.
- `@sveltejs/kit`: `2.61.1`, MIT, modified 2026-05-24.
- `effect`: `3.21.2`, MIT, modified 2026-05-28.
- `@effect/platform`: `0.96.1`, MIT, modified 2026-04-22.
- `@effect/platform-node`: `0.106.0`, MIT, modified 2026-05-28.
- `@effect/sql`: `0.51.1`, MIT, modified 2026-04-22.
- `@effect/sql-sqlite-node`: `0.52.0`, MIT, modified 2026-05-28.
- `@tanstack/svelte-virtual`: `3.13.26`, MIT, modified 2026-05-25.
- `virtua`: `0.49.1`, MIT, modified 2026-04-12.
