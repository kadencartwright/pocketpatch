import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigServiceLive, resolveConfigPaths } from "@pocketpatch/config";
import {
  DaemonControlServiceLive,
  DaemonServerFactory,
  DaemonServerFactoryLive,
} from "@pocketpatch/daemon";
import { NetworkServiceNodeLive } from "@pocketpatch/network";
import {
  ProjectNotFoundError,
  StorageService,
  StorageServiceLive,
} from "@pocketpatch/storage";
import { Effect, Layer } from "effect";
import {
  DaemonClientServiceLive,
  DaemonSupervisorServiceLive,
  runCli,
  WorkingDirectoryServiceLive,
} from "./index";

const NoopDaemonServerFactoryLive = Layer.succeed(DaemonServerFactory, {
  bind: () => Effect.void,
});

const NoopStorageServiceLive = Layer.succeed(StorageService, {
  createComment: () => Effect.die("Storage is unavailable for this command"),
  deleteComment: () => Effect.die("Storage is unavailable for this command"),
  getProject: (projectId) =>
    Effect.fail(new ProjectNotFoundError({ projectId })),
  listComments: () => Effect.succeed([]),
  listProjects: Effect.succeed([]),
  registerProject: () => Effect.die("Storage is unavailable for this command"),
  resolveComment: () => Effect.die("Storage is unavailable for this command"),
});

const commandNeedsStorage = (args: ReadonlyArray<string>): boolean =>
  (args.length === 2 && args[0] === "daemon" && args[1] === "start") ||
  (args[0] === "comments" && !args.includes("--help"));

const runWithBaseLayers = (args: ReadonlyArray<string>, env: ConfigEnv) =>
  runCli(args, env).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(DaemonClientServiceLive),
    Effect.provide(DaemonControlServiceLive),
    Effect.provide(DaemonSupervisorServiceLive),
    Effect.provide(NoopDaemonServerFactoryLive),
    Effect.provide(NetworkServiceNodeLive),
    Effect.provide(NoopStorageServiceLive),
    Effect.provide(WorkingDirectoryServiceLive),
  );

const runWithStorageLayers = async (
  args: ReadonlyArray<string>,
  env: ConfigEnv,
) => {
  const paths = await resolveConfigPaths(env);

  await mkdir(dirname(paths.stateDb), { recursive: true });

  return Effect.runPromise(
    runCli(args, env).pipe(
      Effect.provide(ConfigServiceLive),
      Effect.provide(DaemonClientServiceLive),
      Effect.provide(DaemonControlServiceLive),
      Effect.provide(DaemonSupervisorServiceLive),
      Effect.provide(DaemonServerFactoryLive),
      Effect.provide(NetworkServiceNodeLive),
      Effect.provide(WorkingDirectoryServiceLive),
      Effect.provide(StorageServiceLive),
      Effect.provide(
        SqliteClient.layer({
          filename: paths.stateDb,
        }),
      ),
    ),
  );
};

export const runPocketPatchCli = (
  args: ReadonlyArray<string>,
  env: ConfigEnv,
) =>
  commandNeedsStorage(args)
    ? runWithStorageLayers(args, env)
    : Effect.runPromise(runWithBaseLayers(args, env));
