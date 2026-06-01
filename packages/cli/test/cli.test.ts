import type { ConfigEnv, PocketPatchConfig } from "@pocketpatch/config";
import { ConfigService, setBindAddressEffect } from "@pocketpatch/config";
import { DaemonControlService, DaemonServerFactory } from "@pocketpatch/daemon";
import type { LocalAddress } from "@pocketpatch/network";
import { NetworkService } from "@pocketpatch/network";
import {
  CommentNotFoundError,
  ProjectNotFoundError,
  StorageService,
} from "@pocketpatch/storage";
import { Effect, Layer } from "effect";
import { describe, expect, test } from "vitest";
import {
  DaemonClientError,
  DaemonClientService,
  DaemonSupervisorService,
  runCli,
  WorkingDirectoryService,
} from "../src/index";

const env: ConfigEnv = {
  HOME: "/home/k",
  XDG_CONFIG_HOME: "/config",
};

const config: PocketPatchConfig = {
  version: 1,
  network: {
    bindAddress: null,
    port: 3217,
  },
};

const addresses: Array<LocalAddress> = [
  {
    address: "127.0.0.1",
    family: "IPv4",
    interfaceName: "lo",
    internal: true,
  },
  {
    address: "::1",
    family: "IPv6",
    interfaceName: "lo",
    internal: true,
  },
  {
    address: "100.64.12.34",
    family: "IPv4",
    interfaceName: "tailscale0",
    internal: false,
  },
];

const ConfigTest = Layer.succeed(ConfigService, {
  load: () => Effect.succeed(config),
  paths: () =>
    Effect.succeed({
      cacheDir: "/cache/pocketpatch",
      configFile: "/config/pocketpatch/config.json",
      runtimeDir: "/run/pocketpatch",
      stateDb: "/state/pocketpatch/pocketpatch.db",
    }),
  save: () => Effect.void,
  setBindAddress: (currentConfig, bindAddress) =>
    Effect.succeed({
      ...currentConfig,
      network: {
        ...currentConfig.network,
        bindAddress,
      },
    }),
});

const NetworkTest = Layer.succeed(NetworkService, {
  computeListenAddresses: () =>
    Effect.succeed(["127.0.0.1", "::1", "100.64.12.34"]),
  listLocalAddresses: Effect.succeed(addresses),
  validateBindAddress: () => Effect.succeed(null),
});

const DaemonControlTest = Layer.succeed(DaemonControlService, {
  plan: () =>
    Effect.succeed({
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217,
        },
        {
          address: "::1",
          port: 3217,
        },
        {
          address: "100.64.12.34",
          port: 3217,
        },
      ],
    }),
  start: () => Effect.void,
});

const DaemonServerFactoryTest = Layer.succeed(DaemonServerFactory, {
  bind: () => Effect.void,
});

const DaemonSupervisorTest = Layer.succeed(DaemonSupervisorService, {
  ensureStarted: () => Effect.void,
});

const storageTestService = {
  createComment: () => Effect.die("unused"),
  deleteComment: () => Effect.die("unused"),
  getProject: (projectId) =>
    projectId === 1
      ? Effect.succeed({
          createdAt: "2026-05-30T12:00:00.000Z",
          id: 1,
          lastSeenAt: "2026-05-30T12:00:00.000Z",
          path: "/home/k/code/pocketpatch",
        })
      : Effect.fail(new ProjectNotFoundError({ projectId })),
  listComments: (projectId, options) =>
    projectId === 1
      ? Effect.succeed([
          {
            anchorLineContent: "const value = 1;",
            body: "Prefer the Effect helper here.",
            createdAt: "2026-05-31T12:00:00.000Z",
            filePath: "packages/daemon/src/index.ts",
            id: 1,
            newLineNumber: 353,
            oldLineNumber: null,
            projectId,
            resolvedAt: null,
          },
          ...(options?.showResolved === true
            ? [
                {
                  anchorLineContent: "const oldValue = 1;",
                  body: "Already handled.",
                  createdAt: "2026-05-31T12:01:00.000Z",
                  filePath: "packages/daemon/src/index.ts",
                  id: 2,
                  newLineNumber: 354,
                  oldLineNumber: null,
                  projectId,
                  resolvedAt: "2026-05-31T12:02:00.000Z",
                },
              ]
            : []),
        ])
      : Effect.succeed([]),
  listProjects: Effect.succeed([
    {
      createdAt: "2026-05-30T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-30T12:00:00.000Z",
      path: "/home/k/code/pocketpatch",
    },
  ]),
  registerProject: () => Effect.die("unused"),
  resolveComment: (projectId, commentId) =>
    commentId === 1
      ? Effect.succeed({
          anchorLineContent: "const value = 1;",
          body: "Prefer the Effect helper here.",
          createdAt: "2026-05-31T12:00:00.000Z",
          filePath: "packages/daemon/src/index.ts",
          id: commentId,
          newLineNumber: 353,
          oldLineNumber: null,
          projectId,
          resolvedAt: "2026-05-31T12:02:00.000Z",
        })
      : Effect.fail(new CommentNotFoundError({ commentId, projectId })),
};

const StorageTest = Layer.succeed(StorageService, storageTestService);

const DaemonClientTest = Layer.succeed(DaemonClientService, {
  registerProject: (_env, path) =>
    Effect.succeed({
      project: {
        createdAt: "2026-05-30T12:00:00.000Z",
        id: 1,
        lastSeenAt: "2026-05-30T12:00:00.000Z",
        path,
      },
      reviewUrl: "http://127.0.0.1:3217/projects/1",
    }),
});

const WorkingDirectoryTest = Layer.succeed(WorkingDirectoryService, {
  cwd: Effect.succeed("/home/k/code/pocketpatch"),
});

const runTestCli = (args: ReadonlyArray<string>) =>
  Effect.runPromise(
    runCli(args, env).pipe(
      Effect.provide(ConfigTest),
      Effect.provide(NetworkTest),
      Effect.provide(DaemonControlTest),
      Effect.provide(DaemonServerFactoryTest),
      Effect.provide(DaemonSupervisorTest),
      Effect.provide(DaemonClientTest),
      Effect.provide(StorageTest),
      Effect.provide(WorkingDirectoryTest),
    ),
  );

describe("runCli", () => {
  test("prints local addresses", async () => {
    await expect(runTestCli(["config", "addresses"])).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: [
        "interface\tfamily\taddress\tinternal",
        "lo\tIPv4\t127.0.0.1\ttrue",
        "lo\tIPv6\t::1\ttrue",
        "tailscale0\tIPv4\t100.64.12.34\tfalse",
        "",
      ].join("\n"),
    });
  });

  test("prints the current config and config file path", async () => {
    await expect(runTestCli(["config", "show"])).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: [
        "Config: /config/pocketpatch/config.json",
        JSON.stringify(config, null, 2),
        "",
      ].join("\n"),
    });
  });

  test("sets and persists the configured bind address", async () => {
    let savedConfig: PocketPatchConfig | null = null;
    const ConfigMutationTest = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(config),
      paths: () => Effect.die("unused"),
      save: (_env, nextConfig) =>
        Effect.sync(() => {
          savedConfig = nextConfig;
        }),
      setBindAddress: (currentConfig, bindAddress) =>
        Effect.succeed({
          ...currentConfig,
          network: {
            ...currentConfig.network,
            bindAddress,
          },
        }),
    });

    const result = await Effect.runPromise(
      runCli(["config", "set-bind-address", "100.64.12.34"], env).pipe(
        Effect.provide(ConfigMutationTest),
        Effect.provide(NetworkTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Updated bind address: 100.64.12.34\n",
    });
    expect(savedConfig).toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217,
      },
    });
  });

  test("prints the daemon startup plan", async () => {
    await expect(runTestCli(["daemon", "plan"])).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: ["127.0.0.1:3217", "[::1]:3217", "100.64.12.34:3217", ""].join(
        "\n",
      ),
    });
  });

  test("starts the daemon through the daemon control service", async () => {
    const startedWith: Array<ConfigEnv> = [];
    const DaemonControlStartTest = Layer.succeed(DaemonControlService, {
      plan: () => Effect.die("unused"),
      start: (startEnv) =>
        Effect.sync(() => {
          startedWith.push(startEnv);
        }),
    });

    const result = await Effect.runPromise(
      runCli(["daemon", "start"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlStartTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Starting daemon in foreground\n",
    });
    expect(startedWith).toEqual([env]);
  });

  test("registers the current working directory", async () => {
    const registered: Array<string> = [];
    const DaemonClientRegisterTest = Layer.succeed(DaemonClientService, {
      registerProject: (_env, path) =>
        Effect.sync(() => {
          registered.push(path);
          return {
            project: {
              createdAt: "2026-05-30T12:00:00.000Z",
              id: 7,
              lastSeenAt: "2026-05-30T12:00:00.000Z",
              path,
            },
            reviewUrl: "http://127.0.0.1:3217/projects/7",
          };
        }),
    });

    const result = await Effect.runPromise(
      runCli(["register"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
        Effect.provide(DaemonClientRegisterTest),
        Effect.provide(WorkingDirectoryTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "http://127.0.0.1:3217/projects/7\n",
    });
    expect(registered).toEqual(["/home/k/code/pocketpatch"]);
  });

  test("registers an explicit path", async () => {
    const registered: Array<string> = [];
    const DaemonClientRegisterTest = Layer.succeed(DaemonClientService, {
      registerProject: (_env, path) =>
        Effect.sync(() => {
          registered.push(path);
          return {
            project: {
              createdAt: "2026-05-30T12:00:00.000Z",
              id: 8,
              lastSeenAt: "2026-05-30T12:00:00.000Z",
              path,
            },
            reviewUrl: "http://127.0.0.1:3217/projects/8",
          };
        }),
    });

    const result = await Effect.runPromise(
      runCli(["register", "/tmp/project"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
        Effect.provide(DaemonClientRegisterTest),
        Effect.provide(WorkingDirectoryTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "http://127.0.0.1:3217/projects/8\n",
    });
    expect(registered).toEqual(["/tmp/project"]);
  });

  test("auto-starts the daemon when registration cannot reach it", async () => {
    let attempts = 0;
    const startedWith: Array<ConfigEnv> = [];
    const DaemonClientStartsOnRetryTest = Layer.succeed(DaemonClientService, {
      registerProject: (_env, path) =>
        Effect.suspend(() => {
          attempts += 1;

          if (attempts === 1) {
            return Effect.fail(
              new DaemonClientError({
                cause: new Error("connection refused"),
              }),
            );
          }

          return Effect.succeed({
            project: {
              createdAt: "2026-05-30T12:00:00.000Z",
              id: 9,
              lastSeenAt: "2026-05-30T12:00:00.000Z",
              path,
            },
            reviewUrl: "http://127.0.0.1:3217/projects/9",
          });
        }),
    });
    const DaemonSupervisorStartsTest = Layer.succeed(DaemonSupervisorService, {
      ensureStarted: (startEnv) =>
        Effect.sync(() => {
          startedWith.push(startEnv);
        }),
    });

    const result = await Effect.runPromise(
      runCli(["register"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorStartsTest),
        Effect.provide(DaemonClientStartsOnRetryTest),
        Effect.provide(WorkingDirectoryTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "http://127.0.0.1:3217/projects/9\n",
    });
    expect(attempts).toBe(2);
    expect(startedWith).toEqual([env]);
  });

  test("returns a daemon start hint when registration cannot reach the daemon", async () => {
    const DaemonClientFailingTest = Layer.succeed(DaemonClientService, {
      registerProject: () =>
        Effect.fail(
          new DaemonClientError({
            cause: new Error("connection refused"),
          }),
        ),
    });

    const result = await Effect.runPromise(
      runCli(["register"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
        Effect.provide(DaemonClientFailingTest),
        Effect.provide(WorkingDirectoryTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr:
        "PocketPatch daemon is not reachable. Start it with: pocketpatch daemon start\n",
      stdout: "",
    });
  });

  test("prints comments for an explicit project", async () => {
    const result = await runTestCli(["comments", "--project", "1"]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: [
        "PocketPatch comments for /home/k/code/pocketpatch (project 1)",
        "",
        "packages/daemon/src/index.ts",
        "- new 353 (comment 1)",
        "  Prefer the Effect helper here.",
        "",
      ].join("\n"),
    });
  });

  test("prints resolved comments when requested", async () => {
    const result = await runTestCli([
      "comments",
      "--project",
      "1",
      "--show-resolved",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("- new 354 (comment 2) [resolved]");
  });

  test("prints comments for the project containing the current working directory", async () => {
    const result = await Effect.runPromise(
      runCli(["comments"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
        Effect.provide(DaemonClientTest),
        Effect.provide(StorageTest),
        Effect.provide(
          Layer.succeed(WorkingDirectoryService, {
            cwd: Effect.succeed("/home/k/code/pocketpatch/packages/cli"),
          }),
        ),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "PocketPatch comments for /home/k/code/pocketpatch (project 1)",
    );
  });

  test("returns a helpful failure when comments cannot infer a registered project", async () => {
    const result = await Effect.runPromise(
      runCli(["comments"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonSupervisorTest),
        Effect.provide(DaemonClientTest),
        Effect.provide(
          Layer.succeed(StorageService, {
            ...storageTestService,
            listProjects: Effect.succeed([]),
          }),
        ),
        Effect.provide(WorkingDirectoryTest),
      ),
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr:
        "No registered PocketPatch project contains /home/k/code/pocketpatch. Run pocketpatch register from the project first, or pass --project.\n",
      stdout: "",
    });
  });

  test("resolves comments for the project containing the current working directory", async () => {
    const result = await runTestCli(["comments", "resolve", "1"]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Resolved comment 1\n",
    });
  });

  test("returns a failed result for invalid bind addresses", async () => {
    let savedConfig: PocketPatchConfig | null = null;
    const ConfigValidationTest = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(config),
      paths: () => Effect.die("unused"),
      save: (_env, nextConfig) =>
        Effect.sync(() => {
          savedConfig = nextConfig;
        }),
      setBindAddress: setBindAddressEffect,
    });

    const result = await Effect.runPromise(
      runCli(["config", "set-bind-address", "not-an-ip"], env).pipe(
        Effect.provide(ConfigValidationTest),
        Effect.provide(NetworkTest),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Expected a valid IP address");
    expect(savedConfig).toBe(null);
  });

  test("returns Effect CLI validation output for unknown commands", async () => {
    const result = await runTestCli(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Invalid subcommand for pocketpatch - use one of 'comments', 'config', 'daemon', 'register'",
    );
  });
});
