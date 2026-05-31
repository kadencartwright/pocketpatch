import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Either, Exit, Layer } from "effect";
import * as Daemon from "../src/index";

describe("daemon server runner", () => {
  test("starts one server per planned endpoint", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) =>
        Effect.sync(() => {
          started.push(endpoint);
        })
    });
    const plan: Daemon.DaemonStartupPlan = {
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217
        },
        {
          address: "100.64.12.34",
          port: 3217
        }
      ]
    };

    await Effect.runPromise(
      Effect.scoped(
        Daemon.startDaemonServers(plan).pipe(Effect.provide(FactoryTest))
      )
    );

    expect(started).toEqual(plan.endpoints);
  });

  test("releases already-started servers when a later endpoint fails", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const stopped: Array<Daemon.DaemonEndpoint> = [];
    const failingEndpoint: Daemon.DaemonEndpoint = {
      address: "100.64.12.34",
      port: 3217
    };
    const error = new Daemon.DaemonServerBindError({
      cause: new Error("bind failed"),
      endpoint: failingEndpoint
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
            })
        );
      }
    });
    const plan: Daemon.DaemonStartupPlan = {
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217
        },
        failingEndpoint
      ]
    };
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Daemon.startDaemonServers(plan).pipe(Effect.provide(FactoryTest))
      )
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
            port: 3217
          }
        }),
      paths: () => Effect.die("unused"),
      save: () => Effect.die("unused"),
      setBindAddress: () => Effect.die("unused")
    });
    const NetworkTest = Layer.succeed(NetworkService, {
      computeListenAddresses: () => Effect.succeed(["127.0.0.1", "::1"]),
      listLocalAddresses: Effect.die("unused"),
      validateBindAddress: () => Effect.die("unused")
    });
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) =>
        Effect.sync(() => {
          started.push(endpoint);
        })
    });

    await Effect.runPromise(
      Effect.scoped(
        Daemon.startDaemon({ HOME: "/home/k" }).pipe(
          Effect.provide(ConfigTest),
          Effect.provide(NetworkTest),
          Effect.provide(FactoryTest)
        )
      )
    );

    expect(started).toEqual([
      {
        address: "127.0.0.1",
        port: 3217
      },
      {
        address: "::1",
        port: 3217
      }
    ]);
  });
});
