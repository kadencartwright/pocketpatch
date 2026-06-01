# PocketPatch CLI

Run PocketPatch with npm:

```sh
npx pocketpatch register
```

`register` starts the local daemon when needed, registers the current
directory, and prints a review URL served by the daemon.

The CLI is distributed as an npm package with the internal PocketPatch
workspace modules and browser assets bundled into the package. It runs on
Node, so `npx pocketpatch` and global npm installs use the standard npm
executable path.
