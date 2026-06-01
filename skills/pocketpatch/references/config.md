# PocketPatch Config And Development Reference

Load this file only when the user asks about PocketPatch network setup,
Tailscale, daemon debugging, config/state files, or running PocketPatch from its
source repository.

## Requirements

- Node.js 20 or newer.
- Git.
- Network reachability from the review device to the machine running
  PocketPatch.

## Tailscale And Network Setup

PocketPatch uses port `3217` by default. For phone review over Tailscale:

```sh
npx pocketpatch config addresses
npx pocketpatch config set-bind-address 100.x.y.z
npx pocketpatch register
```

Use `daemon plan` to see the endpoints the daemon will bind:

```sh
npx pocketpatch daemon plan
```

Use `daemon start` when foreground logs are useful:

```sh
npx pocketpatch daemon start
```

## Config And State Paths

PocketPatch stores user-scoped files in XDG-style paths:

- Config: `$XDG_CONFIG_HOME/pocketpatch/config.json`, or
  `~/.config/pocketpatch/config.json`.
- State database: `$XDG_STATE_HOME/pocketpatch/pocketpatch.db`, or
  `~/.local/state/pocketpatch/pocketpatch.db`.
- Cache: `$XDG_CACHE_HOME/pocketpatch`, or `~/.cache/pocketpatch`.

Print the active config file and JSON:

```sh
npx pocketpatch config show
```

## Running From The PocketPatch Repo

Install workspace dependencies:

```sh
pnpm install
```

Run the daemon and web app while iterating:

```sh
pnpm run dev
```

Run the CLI source entrypoint:

```sh
pnpm --filter pocketpatch exec tsx src/bin.ts register
pnpm --filter pocketpatch exec tsx src/bin.ts comments
```

Run the built CLI:

```sh
pnpm --filter pocketpatch build
node packages/cli/dist/bin.js register
node packages/cli/dist/bin.js comments
```

Before reporting development changes done, run relevant checks:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm fallow
```
