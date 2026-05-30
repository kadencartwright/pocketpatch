import { SqliteClient } from "@effect/sql-sqlite-bun";
import { ConfigServiceLive, resolveConfigPaths } from "@pocketpatch/config";
import type { ConfigEnv } from "@pocketpatch/config";
import { DaemonControlServiceLive, DaemonServerFactory, DaemonServerFactoryLive } from "@pocketpatch/daemon";
import { NetworkServiceNodeLive } from "@pocketpatch/network";
import { StorageServiceLive } from "@pocketpatch/storage";
import { Effect, Layer } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DaemonClientServiceLive, WorkingDirectoryServiceLive, runCli } from "./index";

const NoopDaemonServerFactoryLive = Layer.succeed(DaemonServerFactory, {
  bind: () => Effect.void
});

const commandNeedsStorage = (args: ReadonlyArray<string>): boolean =>
  args.length === 2 && args[0] === "daemon" && args[1] === "start";

const runWithBaseLayers = (
  args: ReadonlyArray<string>,
  env: ConfigEnv
) =>
  runCli(args, env).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(DaemonClientServiceLive),
    Effect.provide(DaemonControlServiceLive),
    Effect.provide(NoopDaemonServerFactoryLive),
    Effect.provide(NetworkServiceNodeLive),
    Effect.provide(WorkingDirectoryServiceLive)
  );

const runWithStorageLayers = async (
  args: ReadonlyArray<string>,
  env: ConfigEnv
) => {
  const paths = await resolveConfigPaths(env);

  await mkdir(dirname(paths.stateDb), { recursive: true });

  return Effect.runPromise(
    runCli(args, env).pipe(
      Effect.provide(ConfigServiceLive),
      Effect.provide(DaemonClientServiceLive),
      Effect.provide(DaemonControlServiceLive),
      Effect.provide(DaemonServerFactoryLive),
      Effect.provide(NetworkServiceNodeLive),
      Effect.provide(WorkingDirectoryServiceLive),
      Effect.provide(StorageServiceLive),
      Effect.provide(SqliteClient.layer({
        filename: paths.stateDb
      }))
    )
  );
};

export const runPocketPatchCli = (
  args: ReadonlyArray<string>,
  env: ConfigEnv
) =>
  commandNeedsStorage(args)
    ? runWithStorageLayers(args, env)
    : Effect.runPromise(runWithBaseLayers(args, env));
