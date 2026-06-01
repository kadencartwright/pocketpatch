import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { Args, Command, Options, ValidationError } from "@effect/cli";
import {
  type FileSystem,
  HttpApiClient,
  type HttpClient,
} from "@effect/platform";
import { NodeContext, NodeHttpClient } from "@effect/platform-node";
import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import type { DaemonEndpoint } from "@pocketpatch/daemon";
import {
  DaemonControlService,
  type DaemonServerFactory,
  PocketPatchApi,
  type ProjectRegistrationResponseSchema,
} from "@pocketpatch/daemon";
import type { LocalAddress } from "@pocketpatch/network";
import { NetworkService } from "@pocketpatch/network";
import type { Project } from "@pocketpatch/storage";
import { StorageService } from "@pocketpatch/storage";
import {
  Cause,
  Console,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
} from "effect";
import { formatProjectComments } from "./comments";
import {
  ProjectContextNotFoundError,
  resolveProjectForCwd,
} from "./project-context";

export type CliResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

type ProjectRegistrationResponse =
  typeof ProjectRegistrationResponseSchema.Type;

const requirePackageJson = createRequire(import.meta.url);
const packageMetadata = requirePackageJson("../package.json") as {
  readonly version?: unknown;
};
const pocketPatchVersion =
  typeof packageMetadata.version === "string"
    ? packageMetadata.version
    : "0.0.0";

export class DaemonClientError extends Schema.TaggedError<DaemonClientError>()(
  "DaemonClientError",
  {
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    return "PocketPatch daemon is not reachable. Start it with: pocketpatch daemon start";
  }
}

export class DaemonClientService extends Context.Tag(
  "@pocketpatch/cli/DaemonClientService",
)<
  DaemonClientService,
  {
    readonly registerProject: (
      env: ConfigEnv,
      path: string,
    ) => Effect.Effect<
      ProjectRegistrationResponse,
      DaemonClientError,
      ConfigService | FileSystem.FileSystem | HttpClient.HttpClient
    >;
  }
>() {}

export class WorkingDirectoryService extends Context.Tag(
  "@pocketpatch/cli/WorkingDirectoryService",
)<
  WorkingDirectoryService,
  {
    readonly cwd: Effect.Effect<string>;
  }
>() {}

export class DaemonSupervisorService extends Context.Tag(
  "@pocketpatch/cli/DaemonSupervisorService",
)<
  DaemonSupervisorService,
  {
    readonly ensureStarted: (
      env: ConfigEnv,
    ) => Effect.Effect<
      void,
      DaemonClientError,
      ConfigService | FileSystem.FileSystem
    >;
  }
>() {}

export const DaemonClientServiceLive = Layer.succeed(DaemonClientService, {
  registerProject: (env, path) =>
    Effect.gen(function* () {
      const configService = yield* ConfigService;
      const config = yield* configService.load(env);
      const client = yield* HttpApiClient.make(PocketPatchApi, {
        baseUrl: `http://127.0.0.1:${config.network.port}/api`,
      });

      return yield* client.projects.register({
        payload: { path },
      });
    }).pipe(
      Effect.mapError((error) =>
        error instanceof DaemonClientError
          ? error
          : new DaemonClientError({ cause: error }),
      ),
    ),
});

const spawnDetachedDaemon = (): void => {
  const entrypoint = process.argv[1];

  if (entrypoint === undefined) {
    throw new Error("Cannot locate PocketPatch CLI entrypoint");
  }

  const child = spawn(process.execPath, [entrypoint, "daemon", "start"], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });

  child.unref();
};

const waitForDaemonHealth = async (port: number): Promise<void> => {
  const healthUrl = `http://127.0.0.1:${port}/api/health`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling while the detached daemon binds its listeners.
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for PocketPatch daemon at ${healthUrl}`);
};

export const DaemonSupervisorServiceLive = Layer.succeed(
  DaemonSupervisorService,
  {
    ensureStarted: (env) =>
      Effect.gen(function* () {
        const configService = yield* ConfigService;
        const config = yield* configService.load(env);

        yield* Effect.try({
          catch: (cause) => new DaemonClientError({ cause }),
          try: spawnDetachedDaemon,
        });
        yield* Effect.tryPromise({
          catch: (cause) => new DaemonClientError({ cause }),
          try: () => waitForDaemonHealth(config.network.port),
        });
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof DaemonClientError
            ? cause
            : new DaemonClientError({ cause }),
        ),
      ),
  },
);

export const WorkingDirectoryServiceLive = Layer.succeed(
  WorkingDirectoryService,
  {
    cwd: Effect.sync(() => process.cwd()),
  },
);

class CliOutput extends Context.Tag("@pocketpatch/cli/CliOutput")<
  CliOutput,
  {
    readonly stderr: (chunk: string) => Effect.Effect<void>;
    readonly stdout: (chunk: string) => Effect.Effect<void>;
  }
>() {}

const writeStdout = (chunk: string) =>
  Effect.flatMap(CliOutput, (output) => output.stdout(chunk));

const formatAddresses = (addresses: ReadonlyArray<LocalAddress>): string =>
  [
    "interface\tfamily\taddress\tinternal",
    ...addresses.map(
      (address) =>
        `${address.interfaceName}\t${address.family}\t${address.address}\t${String(address.internal)}`,
    ),
    "",
  ].join("\n");

const formatConfig = (configFile: string, config: unknown): string =>
  [`Config: ${configFile}`, JSON.stringify(config, null, 2), ""].join("\n");

const formatEndpoint = (endpoint: DaemonEndpoint): string =>
  endpoint.address.includes(":")
    ? `[${endpoint.address}]:${endpoint.port}`
    : `${endpoint.address}:${endpoint.port}`;

const formatDaemonPlan = (endpoints: ReadonlyArray<DaemonEndpoint>): string =>
  [...endpoints.map(formatEndpoint), ""].join("\n");

const formatCause = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  if (ValidationError.isValidationError(error)) {
    return "";
  }

  return error instanceof Error ? error.message : String(error);
};

const optionalProjectId = Options.integer("project").pipe(Options.optional);
const showResolvedOption = Options.boolean("show-resolved", {
  ifPresent: true,
});

const resolveProjectContext = (
  project: Option.Option<number>,
): Effect.Effect<Project, unknown, StorageService | WorkingDirectoryService> =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const workingDirectory = yield* WorkingDirectoryService;

    return yield* Option.match(project, {
      onNone: () =>
        Effect.gen(function* () {
          const cwd = yield* workingDirectory.cwd;
          const projects = yield* storage.listProjects;
          const inferredProject = resolveProjectForCwd(projects, cwd);

          if (inferredProject instanceof ProjectContextNotFoundError) {
            return yield* Effect.fail(inferredProject);
          }

          return inferredProject;
        }),
      onSome: (projectId) => storage.getProject(projectId),
    });
  });

const consoleLine = (args: ReadonlyArray<unknown>): string =>
  `${args.map(String).join(" ")}\n`;

const makeCapturingConsole = (
  stdout: Array<string>,
  stderr: Array<string>,
): Console.Console => ({
  [Console.TypeId]: Console.TypeId,
  assert: () => Effect.void,
  clear: Effect.void,
  count: () => Effect.void,
  countReset: () => Effect.void,
  debug: (...args) => Effect.sync(() => stderr.push(consoleLine(args))),
  dir: (...args) => Effect.sync(() => stdout.push(consoleLine(args))),
  dirxml: (...args) => Effect.sync(() => stdout.push(consoleLine(args))),
  error: (...args) => Effect.sync(() => stderr.push(consoleLine(args))),
  group: () => Effect.void,
  groupEnd: Effect.void,
  info: (...args) => Effect.sync(() => stdout.push(consoleLine(args))),
  log: (...args) => Effect.sync(() => stdout.push(consoleLine(args))),
  table: (...args) => Effect.sync(() => stdout.push(consoleLine(args))),
  time: () => Effect.void,
  timeEnd: () => Effect.void,
  timeLog: () => Effect.void,
  trace: (...args) => Effect.sync(() => stderr.push(consoleLine(args))),
  unsafe: console,
  warn: (...args) => Effect.sync(() => stderr.push(consoleLine(args))),
});

const configAddressesCommand = Command.make("addresses", {}, () =>
  Effect.gen(function* () {
    const network = yield* NetworkService;
    const addresses = yield* network.listLocalAddresses;

    yield* writeStdout(formatAddresses(addresses));
  }),
);

const configShowCommand = (env: ConfigEnv) =>
  Command.make("show", {}, () =>
    Effect.gen(function* () {
      const configService = yield* ConfigService;
      const paths = yield* configService.paths(env);
      const config = yield* configService.load(env);

      yield* writeStdout(formatConfig(paths.configFile, config));
    }),
  );

const configSetBindAddressCommand = (env: ConfigEnv) =>
  Command.make(
    "set-bind-address",
    {
      bindAddress: Args.text({ name: "bind-address" }),
    },
    ({ bindAddress }) =>
      Effect.gen(function* () {
        const configService = yield* ConfigService;
        const config = yield* configService.load(env);
        const nextConfig = yield* configService.setBindAddress(
          config,
          bindAddress,
        );

        yield* configService.save(env, nextConfig);
        yield* writeStdout(`Updated bind address: ${bindAddress}\n`);
      }),
  );

const configCommand = (env: ConfigEnv) =>
  Command.make("config").pipe(
    Command.withSubcommands([
      configAddressesCommand,
      configShowCommand(env),
      configSetBindAddressCommand(env),
    ]),
  );

const daemonPlanCommand = (env: ConfigEnv) =>
  Command.make("plan", {}, () =>
    Effect.gen(function* () {
      const daemon = yield* DaemonControlService;
      const plan = yield* daemon.plan(env);

      yield* writeStdout(formatDaemonPlan(plan.endpoints));
    }),
  );

const daemonStartCommand = (env: ConfigEnv) =>
  Command.make("start", {}, () =>
    Effect.gen(function* () {
      const daemon = yield* DaemonControlService;

      yield* writeStdout("Starting daemon in foreground\n");
      yield* daemon.start(env);
    }),
  );

const daemonCommand = (env: ConfigEnv) =>
  Command.make("daemon").pipe(
    Command.withSubcommands([daemonPlanCommand(env), daemonStartCommand(env)]),
  );

const registerCommand = (env: ConfigEnv) =>
  Command.make(
    "register",
    {
      path: Args.text({ name: "path" }).pipe(Args.optional),
    },
    ({ path }) =>
      Effect.gen(function* () {
        const daemonClient = yield* DaemonClientService;
        const daemonSupervisor = yield* DaemonSupervisorService;
        const workingDirectory = yield* WorkingDirectoryService;
        const projectPath = yield* Option.match(path, {
          onNone: () => workingDirectory.cwd,
          onSome: (value) => Effect.succeed(value),
        });
        const response = yield* daemonClient
          .registerProject(env, projectPath)
          .pipe(
            Effect.catchAll((error) =>
              error instanceof DaemonClientError
                ? daemonSupervisor
                    .ensureStarted(env)
                    .pipe(
                      Effect.zipRight(
                        daemonClient.registerProject(env, projectPath),
                      ),
                    )
                : Effect.fail(error),
            ),
          );

        yield* writeStdout(`${response.reviewUrl}\n`);
      }),
  );

const commentsCommand = Command.make(
  "comments",
  {
    project: optionalProjectId,
    showResolved: showResolvedOption,
  },
  ({ project, showResolved }) =>
    Effect.gen(function* () {
      const storage = yield* StorageService;
      const resolvedProject = yield* resolveProjectContext(project);
      const comments = yield* storage.listComments(resolvedProject.id, {
        showResolved,
      });

      yield* writeStdout(formatProjectComments(resolvedProject, comments));
    }),
).pipe(
  Command.withSubcommands([
    Command.make(
      "resolve",
      {
        commentId: Args.integer({ name: "comment-id" }),
        project: optionalProjectId,
      },
      ({ commentId, project }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;
          const resolvedProject = yield* resolveProjectContext(project);

          yield* storage.resolveComment(resolvedProject.id, commentId);
          yield* writeStdout(`Resolved comment ${commentId}\n`);
        }),
    ),
  ]),
);

const pocketPatchCommand = (env: ConfigEnv) =>
  Command.make("pocketpatch").pipe(
    Command.withSubcommands([
      commentsCommand,
      configCommand(env),
      daemonCommand(env),
      registerCommand(env),
    ]),
  );

const runCliCommand = (args: ReadonlyArray<string>, env: ConfigEnv) =>
  Command.run(pocketPatchCommand(env), {
    name: "PocketPatch",
    version: pocketPatchVersion,
  })(["node", "pocketpatch", ...args]);

export const runCli = (
  args: ReadonlyArray<string>,
  env: ConfigEnv,
): Effect.Effect<
  CliResult,
  never,
  | ConfigService
  | DaemonClientService
  | DaemonControlService
  | DaemonServerFactory
  | DaemonSupervisorService
  | NetworkService
  | StorageService
  | WorkingDirectoryService
> =>
  Effect.gen(function* () {
    const stdout: Array<string> = [];
    const stderr: Array<string> = [];
    const output = Layer.succeed(CliOutput, {
      stderr: (chunk) => Effect.sync(() => stderr.push(chunk)),
      stdout: (chunk) => Effect.sync(() => stdout.push(chunk)),
    });

    const exit = yield* Effect.exit(
      runCliCommand(args, env).pipe(
        Effect.provide(output),
        Effect.provide(NodeHttpClient.layer),
        Effect.provide(NodeContext.layer),
        Console.withConsole(makeCapturingConsole(stdout, stderr)),
      ),
    );

    if (Exit.isSuccess(exit)) {
      return {
        exitCode: 0,
        stderr: stderr.join(""),
        stdout: stdout.join(""),
      };
    }

    const message = formatCause(exit.cause);

    return {
      exitCode: 1,
      stderr: `${stderr.join("")}${message === "" ? "" : `${message}\n`}`,
      stdout: stdout.join(""),
    };
  });
