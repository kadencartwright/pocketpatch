# PocketPatch

PocketPatch is a local, mobile-friendly diff review tool for uncommitted code
changes. It is built for reviewing agent-generated work from a phone without
creating a pull request first.

## Quick Start

```sh
npx pocketpatch register
```

`register` starts the local PocketPatch daemon if needed, registers the current
working directory, and prints a review URL. Open that URL in a browser to review
the current uncommitted diff.

After reviewing, print unresolved comments from the CLI:

```sh
npx pocketpatch comments
```

Resolve a comment when it has been handled:

```sh
npx pocketpatch comments resolve 1
```

## Requirements

- Node.js 20 or newer
- Git
- A way for your phone to reach the machine running PocketPatch

PocketPatch works well over Tailscale. Configure the daemon to bind to your
Tailscale IP and the review URL will be reachable from other devices on your
tailnet.

## Tailscale Setup

List local network addresses:

```sh
npx pocketpatch config addresses
```

Set the bind address to your Tailscale IP:

```sh
npx pocketpatch config set-bind-address 100.x.y.z
```

Register your project again:

```sh
npx pocketpatch register
```

By default, PocketPatch uses port `3217`.

## Commands

| Command | Description |
| --- | --- |
| `pocketpatch register [path]` | Register a project and print its review URL. Starts the daemon if needed. |
| `pocketpatch comments` | Print unresolved comments for the current registered project. |
| `pocketpatch comments --show-resolved` | Include resolved comments. |
| `pocketpatch comments --project <id>` | Print comments for a specific project. |
| `pocketpatch comments resolve <id>` | Mark a comment resolved. |
| `pocketpatch config addresses` | List local addresses that can be used for daemon binding. |
| `pocketpatch config show` | Print the active config file path and config JSON. |
| `pocketpatch config set-bind-address <ip>` | Persist the daemon bind address. |
| `pocketpatch daemon plan` | Print the endpoints the daemon will bind. |
| `pocketpatch daemon start` | Start the daemon in the foreground for debugging. |

## How Comments Work

PocketPatch reviews the current uncommitted diff. Comments are attached to
changed lines and hidden when their file or anchor line is no longer present in
the current diff.

The CLI is distributed as an npm package with the internal PocketPatch
workspace modules and browser assets bundled into the package. It runs on
Node, so `npx pocketpatch` and global npm installs use the standard npm
executable path.
