import { describe, expect, test } from "bun:test";
import * as Config from "../src/index";

describe("config path resolution", () => {
  test("resolves paths from XDG environment variables", async () => {
    await expect(
      Config.resolveConfigPaths({
        HOME: "/home/k",
        XDG_CACHE_HOME: "/xdg/cache",
        XDG_CONFIG_HOME: "/xdg/config",
        XDG_RUNTIME_DIR: "/run/user/1000",
        XDG_STATE_HOME: "/xdg/state",
      }),
    ).resolves.toEqual({
      cacheDir: "/xdg/cache/pocketpatch",
      configFile: "/xdg/config/pocketpatch/config.json",
      runtimeDir: "/run/user/1000/pocketpatch",
      stateDb: "/xdg/state/pocketpatch/pocketpatch.db",
    });
  });

  test("falls back to HOME for config, state, and cache paths", async () => {
    await expect(
      Config.resolveConfigPaths({
        HOME: "/home/k",
      }),
    ).resolves.toEqual({
      cacheDir: "/home/k/.cache/pocketpatch",
      configFile: "/home/k/.config/pocketpatch/config.json",
      runtimeDir: null,
      stateDb: "/home/k/.local/state/pocketpatch/pocketpatch.db",
    });
  });

  test("rejects missing HOME when XDG fallbacks are unavailable", async () => {
    await expect(Config.resolveConfigPaths({})).rejects.toMatchObject({
      _tag: "ConfigPathError",
      variable: "HOME",
    });
  });
});
