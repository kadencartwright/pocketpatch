import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { ConfigService } from "@pocketpatch/config";
import { GitService } from "@pocketpatch/git";
import { NetworkService } from "@pocketpatch/network";
import { ProjectNotFoundError, StorageService } from "@pocketpatch/storage";
import { Cause, Effect, Either, Exit, Layer } from "effect";
import * as Daemon from "../src/index";

const getAvailablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("expected TCP address"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });

const fetchHealth = async (port: number) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetch(`http://127.0.0.1:${port}/health`);
    } catch (error) {
      lastError = error;
      await Bun.sleep(25);
    }
  }

  throw lastError;
};

const StorageTest = Layer.succeed(StorageService, {
  createComment: () => Effect.die("unused"),
  deleteComment: () => Effect.die("unused"),
  getProject: (projectId) =>
    Effect.fail(new ProjectNotFoundError({ projectId })),
  listComments: () => Effect.die("unused"),
  registerProject: (path) =>
    Effect.succeed({
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-29T12:00:00.000Z",
      path,
    }),
});

const GitTest = Layer.succeed(GitService, {
  inspectRepository: () => Effect.die("unused"),
});

describe("daemon server runner", () => {
  test("starts one server per planned endpoint", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) =>
        Effect.sync(() => {
          started.push(endpoint);
        }),
    });
    const plan: Daemon.DaemonStartupPlan = {
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217,
        },
        {
          address: "100.64.12.34",
          port: 3217,
        },
      ],
    };

    await Effect.runPromise(
      Effect.scoped(
        Daemon.startDaemonServers(plan).pipe(Effect.provide(FactoryTest)),
      ),
    );

    expect(started).toEqual(plan.endpoints);
  });

  test("releases already-started servers when a later endpoint fails", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const stopped: Array<Daemon.DaemonEndpoint> = [];
    const failingEndpoint: Daemon.DaemonEndpoint = {
      address: "100.64.12.34",
      port: 3217,
    };
    const error = new Daemon.DaemonServerBindError({
      cause: new Error("bind failed"),
      endpoint: failingEndpoint,
    });
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) => {
        if (endpoint.address === failingEndpoint.address) {
          return Effect.fail(error);
        }

        return Effect.acquireRelease(
          Effect.sync(() => {
            started.push(endpoint);
          }),
          () =>
            Effect.sync(() => {
              stopped.push(endpoint);
            }),
        );
      },
    });
    const plan: Daemon.DaemonStartupPlan = {
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217,
        },
        failingEndpoint,
      ],
    };
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Daemon.startDaemonServers(plan).pipe(Effect.provide(FactoryTest)),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOrCause(exit.cause);

      expect(Either.isLeft(failure)).toBe(true);
      if (Either.isLeft(failure)) {
        expect(failure.left).toBe(error);
      }
    }
    expect(started).toEqual([plan.endpoints[0]]);
    expect(stopped).toEqual([plan.endpoints[0]]);
  });

  test("startDaemon composes startup planning with server binding", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const ConfigTest = Layer.succeed(ConfigService, {
      load: () =>
        Effect.succeed({
          version: 1 as const,
          network: {
            bindAddress: null,
            port: 3217,
          },
        }),
      paths: () => Effect.die("unused"),
      save: () => Effect.die("unused"),
      setBindAddress: () => Effect.die("unused"),
    });
    const NetworkTest = Layer.succeed(NetworkService, {
      computeListenAddresses: () => Effect.succeed(["127.0.0.1", "::1"]),
      listLocalAddresses: Effect.die("unused"),
      validateBindAddress: () => Effect.die("unused"),
    });
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) =>
        Effect.sync(() => {
          started.push(endpoint);
        }),
    });

    await Effect.runPromise(
      Effect.scoped(
        Daemon.startDaemon({ HOME: "/home/k" }).pipe(
          Effect.provide(ConfigTest),
          Effect.provide(NetworkTest),
          Effect.provide(FactoryTest),
        ),
      ),
    );

    expect(started).toEqual([
      {
        address: "127.0.0.1",
        port: 3217,
      },
      {
        address: "::1",
        port: 3217,
      },
    ]);
  });

  test("live server factory binds a real HTTP server", async () => {
    const port = await getAvailablePort();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Daemon.startDaemonServer({
            address: "127.0.0.1",
            port,
          });

          const response = yield* Effect.promise(() => fetchHealth(port));
          const body = yield* Effect.promise(() => response.json());

          expect(response.status).toBe(200);
          expect(body).toEqual({
            ok: true,
          });
        }).pipe(
          Effect.provide(Daemon.DaemonServerFactoryLive),
          Effect.provide(StorageTest),
          Effect.provide(GitTest),
        ),
      ),
    );
  });
});
