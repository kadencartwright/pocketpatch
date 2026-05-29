import { describe, expect, test } from "bun:test";
import { Cause, Effect, Either, Exit, Layer } from "effect";
import * as Network from "../src/index";

const addresses: Array<Network.LocalAddress> = [
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

describe("NetworkService", () => {
  test("lists addresses from an injected address source", async () => {
    const source = Layer.succeed(Network.AddressSource, {
      list: () => addresses
    });
    const program = Effect.gen(function*() {
      const service = yield* Network.NetworkService;

      return yield* service.listLocalAddresses;
    });

    await expect(Effect.runPromise(
      program.pipe(
        Effect.provide(Network.NetworkServiceLive),
        Effect.provide(source)
      )
    )).resolves.toEqual(addresses);
  });

  test("computes listen addresses with an injected address source", async () => {
    const source = Layer.succeed(Network.AddressSource, {
      list: () => addresses
    });
    const program = Effect.gen(function*() {
      const service = yield* Network.NetworkService;

      return yield* service.computeListenAddresses({
        version: 1,
        network: {
          bindAddress: "100.64.12.34",
          port: 3217
        }
      });
    });

    await expect(Effect.runPromise(
      program.pipe(
        Effect.provide(Network.NetworkServiceLive),
        Effect.provide(source)
      )
    )).resolves.toEqual([
      "127.0.0.1",
      "::1",
      "100.64.12.34"
    ]);
  });

  test("returns missing bind address as a typed service failure", async () => {
    const source = Layer.succeed(Network.AddressSource, {
      list: () => addresses
    });
    const program = Effect.gen(function*() {
      const service = yield* Network.NetworkService;

      return yield* service.validateBindAddress("100.64.99.99");
    });

    const exit = await Effect.runPromiseExit(
      program.pipe(
        Effect.provide(Network.NetworkServiceLive),
        Effect.provide(source)
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOrCause(exit.cause);

      expect(Either.isLeft(failure)).toBe(true);
      if (Either.isLeft(failure)) {
        expect(failure.left).toBeInstanceOf(Network.BindAddressNotFoundError);
      }
    }
  });
});
