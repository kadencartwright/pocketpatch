import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import * as Daemon from "../src/index";

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

describe("DaemonControlService", () => {
  test("plans startup through the live service", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function*() {
        const daemon = yield* Daemon.DaemonControlService;

        return yield* daemon.plan({ HOME: "/home/k" });
      }).pipe(
        Effect.provide(Daemon.DaemonControlServiceLive),
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest)
      )
    );

    expect(plan).toEqual({
      endpoints: [
        {
          address: "127.0.0.1",
          port: 3217
        },
        {
          address: "::1",
          port: 3217
        }
      ]
    });
  });

  test("starts foreground servers through an injected server factory", async () => {
    const started: Array<Daemon.DaemonEndpoint> = [];
    const stopped: Array<Daemon.DaemonEndpoint> = [];
    const FactoryTest = Layer.succeed(Daemon.DaemonServerFactory, {
      bind: (endpoint) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            started.push(endpoint);
          }),
          () =>
            Effect.sync(() => {
              stopped.push(endpoint);
            })
        )
    });

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const daemon = yield* Daemon.DaemonControlService;

          yield* Effect.fork(daemon.start({ HOME: "/home/k" }));
          yield* Effect.yieldNow();
        }).pipe(
          Effect.provide(Daemon.DaemonControlServiceLive),
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
    expect(stopped).toEqual([...started].reverse());
  });
});
