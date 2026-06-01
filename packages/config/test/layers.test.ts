import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import * as Config from "../src/index";

describe("config Effect layers", () => {
  test("readConfigEffect reads through an injected FileSystem", async () => {
    const env: Config.ConfigEnv = {
      HOME: "/home/k",
      XDG_CONFIG_HOME: "/config",
    };
    const config: Config.PocketPatchConfig = {
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3218,
      },
    };
    const fileSystem = FileSystem.layerNoop({
      exists: (path) =>
        Effect.succeed(path === "/config/pocketpatch/config.json"),
      readFileString: () => Effect.succeed(JSON.stringify(config)),
    });

    const result = await Effect.runPromise(
      Config.readConfigEffect(env).pipe(Effect.provide(fileSystem)),
    );

    expect(result).toEqual(config);
  });

  test("ConfigService load uses the injected FileSystem", async () => {
    const env: Config.ConfigEnv = {
      HOME: "/home/k",
      XDG_CONFIG_HOME: "/config",
    };
    const config: Config.PocketPatchConfig = {
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3218,
      },
    };
    const fileSystem = FileSystem.layerNoop({
      exists: () => Effect.succeed(true),
      readFileString: () => Effect.succeed(JSON.stringify(config)),
    });
    const program = Effect.gen(function* () {
      const service = yield* Config.ConfigService;

      return yield* service.load(env);
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Config.ConfigServiceLive),
        Effect.provide(fileSystem),
      ),
    );

    expect(result).toEqual(config);
  });

  test("ConfigService setBindAddress is Effect-native", async () => {
    const program = Effect.gen(function* () {
      const service = yield* Config.ConfigService;

      return yield* service.setBindAddress(
        Config.defaultConfig,
        "100.64.12.34",
      );
    });

    await expect(
      Effect.runPromise(program.pipe(Effect.provide(Config.ConfigServiceLive))),
    ).resolves.toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217,
      },
    });
  });

  test("ConfigService save uses the injected FileSystem", async () => {
    const env: Config.ConfigEnv = {
      HOME: "/home/k",
      XDG_CONFIG_HOME: "/config",
    };
    const config: Config.PocketPatchConfig = {
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3218,
      },
    };
    const writes: Array<{ path: string; contents: string }> = [];
    const directories: Array<string> = [];
    const fileSystem = FileSystem.layerNoop({
      makeDirectory: (path) =>
        Effect.sync(() => {
          directories.push(path);
        }),
      writeFileString: (path, contents) =>
        Effect.sync(() => {
          writes.push({ contents, path });
        }),
    });
    const program = Effect.gen(function* () {
      const service = yield* Config.ConfigService;

      yield* service.save(env, config);
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(Config.ConfigServiceLive),
        Effect.provide(fileSystem),
      ),
    );

    expect(directories).toEqual(["/config/pocketpatch"]);
    expect(writes).toEqual([
      {
        contents: `${JSON.stringify(config, null, 2)}\n`,
        path: "/config/pocketpatch/config.json",
      },
    ]);
  });
});
