import { ConfigService } from "@pocketpatch/config";
import {
  AddressSource,
  BindAddressNotFoundError,
  NetworkService,
  NetworkServiceLive,
} from "@pocketpatch/network";
import { Cause, Effect, Either, Exit, Layer } from "effect";
import { describe, expect, test } from "vitest";
import * as Daemon from "../src/index";

describe("daemon startup planning", () => {
  test("loads config and computes listen endpoints", async () => {
    const config = {
      version: 1 as const,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217,
      },
    };
    const ConfigTest = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(config),
      paths: () => Effect.die("unused"),
      save: () => Effect.die("unused"),
      setBindAddress: () => Effect.die("unused"),
    });
    const NetworkTest = Layer.succeed(NetworkService, {
      computeListenAddresses: () =>
        Effect.succeed(["127.0.0.1", "::1", "100.64.12.34"]),
      listLocalAddresses: Effect.die("unused"),
      validateBindAddress: () => Effect.die("unused"),
    });

    const plan = await Effect.runPromise(
      Daemon.planDaemonStartup({ HOME: "/home/k" }).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
      ),
    );

    expect(plan).toEqual({
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
    });
  });

  test("preserves network bind-address failures as typed failures", async () => {
    const config = {
      version: 1 as const,
      network: {
        bindAddress: "100.64.99.99",
        port: 3217,
      },
    };
    const error = new BindAddressNotFoundError({
      address: "100.64.99.99",
      availableAddresses: [],
    });
    const ConfigTest = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(config),
      paths: () => Effect.die("unused"),
      save: () => Effect.die("unused"),
      setBindAddress: () => Effect.die("unused"),
    });
    const NetworkTest = Layer.succeed(NetworkService, {
      computeListenAddresses: () => Effect.fail(error),
      listLocalAddresses: Effect.die("unused"),
      validateBindAddress: () => Effect.die("unused"),
    });

    const exit = await Effect.runPromiseExit(
      Daemon.planDaemonStartup({ HOME: "/home/k" }).pipe(
        Effect.provide(ConfigTest),
        Effect.provide(NetworkTest),
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
  });

  test("composes injected config with live network service layer", async () => {
    const configLayer = Layer.succeed(ConfigService, {
      load: () =>
        Effect.succeed({
          version: 1 as const,
          network: {
            bindAddress: "100.64.12.34",
            port: 3218,
          },
        }),
      paths: () => Effect.die("unused"),
      save: () => Effect.die("unused"),
      setBindAddress: () => Effect.die("unused"),
    });
    const addressSource = Layer.succeed(AddressSource, {
      list: () => [
        {
          address: "127.0.0.1",
          family: "IPv4" as const,
          interfaceName: "lo",
          internal: true,
        },
        {
          address: "::1",
          family: "IPv6" as const,
          interfaceName: "lo",
          internal: true,
        },
        {
          address: "100.64.12.34",
          family: "IPv4" as const,
          interfaceName: "tailscale0",
          internal: false,
        },
      ],
    });

    const plan = await Effect.runPromise(
      Daemon.planDaemonStartup({ HOME: "/home/k" }).pipe(
        Effect.provide(configLayer),
        Effect.provide(NetworkServiceLive),
        Effect.provide(addressSource),
      ),
    );

    expect(plan.endpoints).toEqual([
      {
        address: "127.0.0.1",
        port: 3218,
      },
      {
        address: "::1",
        port: 3218,
      },
      {
        address: "100.64.12.34",
        port: 3218,
      },
    ]);
  });
});
