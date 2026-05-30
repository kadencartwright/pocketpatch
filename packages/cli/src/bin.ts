#!/usr/bin/env bun
import { ConfigServiceLive, resolveConfigPaths } from "@pocketpatch/config";
import type { ConfigEnv } from "@pocketpatch/config";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { DaemonControlServiceLive, DaemonServerFactoryLive } from "@pocketpatch/daemon";
import { NetworkServiceNodeLive } from "@pocketpatch/network";
import { StorageServiceLive } from "@pocketpatch/storage";
import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { runCli } from "./index";

const readConfigEnv = (): ConfigEnv => ({
  HOME: process.env.HOME,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME
});

const configEnv = readConfigEnv();
const configPaths = await resolveConfigPaths(configEnv);

await mkdir(dirname(configPaths.stateDb), { recursive: true });

const result = await Effect.runPromise(
  runCli(process.argv.slice(2), configEnv).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(DaemonControlServiceLive),
    Effect.provide(DaemonServerFactoryLive),
    Effect.provide(NetworkServiceNodeLive),
    Effect.provide(StorageServiceLive),
    Effect.provide(SqliteClient.layer({
      filename: configPaths.stateDb
    }))
  )
);

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}

if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
