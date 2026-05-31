import { ConfigService, setBindAddressEffect } from "@pocketpatch/config";
import type { ConfigEnv, PocketPatchConfig } from "@pocketpatch/config";
import { DaemonControlService, DaemonServerFactory } from "@pocketpatch/daemon";
import { NetworkService } from "@pocketpatch/network";
import type { LocalAddress } from "@pocketpatch/network";
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { DaemonClientError, DaemonClientService, WorkingDirectoryService, runCli } from "../src/index";

const env: ConfigEnv = {
  HOME: "/home/k",
  XDG_CONFIG_HOME: "/config"
};

const config: PocketPatchConfig = {
  version: 1,
  network: {
    bindAddress: null,
    port: 3217
  }
};

const addresses: Array<LocalAddress> = [
  {
    address: "127.0.0.1",
    family: "IPv4",
    interfaceName: "lo",
    internal: true
  },
  {
    address: "::1",
    family: "IPv6",
    interfaceName: "lo",
    internal: true
  },
  {
    address: "100.64.12.34",
    family: "IPv4",
    interfaceName: "tailscale0",
    internal: false
  }
];

const ConfigTest = Layer.succeed(ConfigService, {
  load: () => Effect.succeed(config),
  paths: () =>
    Effect.succeed({
      cacheDir: "/cache/pocketpatch",
      configFile: "/config/pocketpatch/config.json",
      runtimeDir: "/run/pocketpatch",
      stateDb: "/state/pocketpatch/pocketpatch.db"
    }),
  save: () => Effect.void,
  setBindAddress: (currentConfig, bindAddress) =>
    Effect.succeed({
      ...currentConfig,
      network: {
        ...currentConfig.network,
        bindAddress
      }
    })
});

const NetworkTest = Layer.succeed(NetworkService, {
  computeListenAddresses: () => Effect.succeed(["127.0.0.1", "::1", "100.64.12.34"]),
  listLocalAddresses: Effect.succeed(addresses),
  validateBindAddress: () => Effect.succeed(null)
});

const DaemonControlTest = Layer.succeed(DaemonControlService, {
  plan: () =>
    Effect.succeed({
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217
        },
        {
          address: "::1",
          port: 3217
        },
        {
          address: "100.64.12.34",
          port: 3217
        }
      ]
    }),
  start: () => Effect.void
});

const DaemonServerFactoryTest = Layer.succeed(DaemonServerFactory, {
  bind: () => Effect.void
});

const DaemonClientTest = Layer.succeed(DaemonClientService, {
  registerProject: (_env, path) =>
    Effect.succeed({
      project: {
        createdAt: "2026-05-30T12:00:00.000Z",
        id: 1,
        lastSeenAt: "2026-05-30T12:00:00.000Z",
        path
      },
      reviewUrl: "http://127.0.0.1:3217/projects/1"
    })
});

const WorkingDirectoryTest = Layer.succeed(WorkingDirectoryService, {
  cwd: Effect.succeed("/home/k/code/pocketpatch")
});

const runTestCli = (args: ReadonlyArray<string>) =>
  Effect.runPromise(
    runCli(args, env).pipe(
      Effect.provide(ConfigTest),
      Effect.provide(NetworkTest),
      Effect.provide(DaemonControlTest),
      Effect.provide(DaemonServerFactoryTest),
      Effect.provide(DaemonClientTest),
      Effect.provide(WorkingDirectoryTest)
    )
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
        ""
      ].join("\n")
    });
  });

  test("prints the current config and config file path", async () => {
    await expect(runTestCli(["config", "show"])).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: [
        "Config: /config/pocketpatch/config.json",
        JSON.stringify(config, null, 2),
        ""
      ].join("\n")
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
            bindAddress
          }
        })
    });

    const result = await Effect.runPromise(
      runCli(["config", "set-bind-address", "100.64.12.34"], env).pipe(
        Effect.provide(ConfigMutationTest),
        Effect.provide(NetworkTest)
      )
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Updated bind address: 100.64.12.34\n"
    });
    expect(savedConfig).toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217
      }
    });
  });

  test("prints the daemon startup plan", async () => {
    await expect(runTestCli(["daemon", "plan"])).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: [
        "127.0.0.1:3217",
        "[::1]:3217",
        "100.64.12.34:3217",
        ""
      ].join("\n")
    });
  });

  test("starts the daemon through the daemon control service", async () => {
    const startedWith: Array<ConfigEnv> = [];
    const DaemonControlStartTest = Layer.succeed(DaemonControlService, {
      plan: () => Effect.die("unused"),
      start: (startEnv) =>
        Effect.sync(() => {
          startedWith.push(startEnv);
        })
    });

    const result = await Effect.runPromise(
      runCli(["daemon", "start"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlStartTest),
        Effect.provide(DaemonServerFactoryTest)
      )
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Starting daemon in foreground\n"
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
              path
            },
            reviewUrl: "http://127.0.0.1:3217/projects/7"
          };
        })
    });

    const result = await Effect.runPromise(
      runCli(["register"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonClientRegisterTest),
        Effect.provide(WorkingDirectoryTest)
      )
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "http://127.0.0.1:3217/projects/7\n"
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
              path
            },
            reviewUrl: "http://127.0.0.1:3217/projects/8"
          };
        })
    });

    const result = await Effect.runPromise(
      runCli(["register", "/tmp/project"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonClientRegisterTest),
        Effect.provide(WorkingDirectoryTest)
      )
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "http://127.0.0.1:3217/projects/8\n"
    });
    expect(registered).toEqual(["/tmp/project"]);
  });

  test("returns a daemon start hint when registration cannot reach the daemon", async () => {
    const DaemonClientFailingTest = Layer.succeed(DaemonClientService, {
      registerProject: () => Effect.fail(new DaemonClientError({
        cause: new Error("connection refused")
      }))
    });

    const result = await Effect.runPromise(
      runCli(["register"], env).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
        Effect.provide(DaemonControlTest),
        Effect.provide(DaemonServerFactoryTest),
        Effect.provide(DaemonClientFailingTest),
        Effect.provide(WorkingDirectoryTest)
      )
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr: "PocketPatch daemon is not reachable. Start it with: pocketpatch daemon start\n",
      stdout: ""
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
      setBindAddress: setBindAddressEffect
    });

    const result = await Effect.runPromise(
      runCli(["config", "set-bind-address", "not-an-ip"], env).pipe(
        Effect.provide(ConfigValidationTest),
        Effect.provide(NetworkTest)
      )
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
    expect(result.stderr).toContain("Invalid subcommand for pocketpatch - use one of 'config', 'daemon'");
  });
});
