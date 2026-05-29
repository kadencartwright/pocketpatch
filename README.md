# PocketPatch

PocketPatch is a mobile-first diff review workspace for agent-generated code changes.

The goal is to let an agent register its current working directory for review, return a scoped phone-friendly URL, and later retrieve unresolved review comments through a CLI.

## Initial Ideas

- Smooth mobile diff browsing
- Inline comments and annotations on changed lines
- Syntax highlighting for common languages
- `pocketpatch review` to register the current directory and print a review URL
- `pocketpatch feedback` to print unresolved comments for the current directory
- Tailscale-first phone access via a configured bind IP address
- XDG user-scoped config, state, cache, and runtime files
- Local daemon state instead of project/worktree discovery
