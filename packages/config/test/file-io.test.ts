import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as Config from "../src/index";

const tempDirs: Array<string> = [];

const makeEnv = async (): Promise<Config.ConfigEnv> => {
  const root = await mkdtemp(join(tmpdir(), "pocketpatch-config-"));
  tempDirs.push(root);

  return {
    HOME: join(root, "home"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_RUNTIME_DIR: join(root, "runtime"),
    XDG_STATE_HOME: join(root, "state"),
  };
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("config file IO", () => {
  test("returns default config when the config file is missing", async () => {
    const env = await makeEnv();

    await expect(Config.readConfig(env)).resolves.toEqual(Config.defaultConfig);
  });

  test("reads and decodes a valid config file", async () => {
    const env = await makeEnv();
    const paths = await Config.resolveConfigPaths(env);

    await mkdir(dirname(paths.configFile), { recursive: true });
    await writeFile(
      paths.configFile,
      JSON.stringify({
        version: 1,
        network: {
          bindAddress: "100.64.12.34",
          port: 3218,
        },
      }),
    );

    await expect(Config.readConfig(env)).resolves.toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3218,
      },
    });
  });

  test("rejects malformed JSON with a typed parse error", async () => {
    const env = await makeEnv();
    const paths = await Config.resolveConfigPaths(env);

    await mkdir(dirname(paths.configFile), { recursive: true });
    await writeFile(paths.configFile, "{");

    await expect(Config.readConfig(env)).rejects.toMatchObject({
      _tag: "ConfigJsonParseError",
      path: paths.configFile,
    });
  });

  test("rejects schema-invalid JSON with a typed validation error", async () => {
    const env = await makeEnv();
    const paths = await Config.resolveConfigPaths(env);

    await mkdir(dirname(paths.configFile), { recursive: true });
    await writeFile(
      paths.configFile,
      JSON.stringify({
        version: 1,
        network: {
          bindAddress: "tailscale0",
          port: 3217,
        },
      }),
    );

    await expect(Config.readConfig(env)).rejects.toMatchObject({
      _tag: "ConfigValidationError",
      path: paths.configFile,
    });
  });

  test("writes deterministic pretty JSON and creates parent directories", async () => {
    const env = await makeEnv();
    const paths = await Config.resolveConfigPaths(env);

    const config: Config.PocketPatchConfig = {
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3218,
      },
    };

    await Config.writeConfig(env, config);

    await expect(readFile(paths.configFile, "utf8")).resolves.toBe(
      `${JSON.stringify(config, null, 2)}\n`,
    );
    await expect(Config.readConfig(env)).resolves.toEqual(config);
  });
});
