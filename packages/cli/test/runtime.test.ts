import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigEnv } from "@pocketpatch/config";
import { resolveConfigPaths } from "@pocketpatch/config";
import { runPocketPatchCli } from "../src/runtime";

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const makeTempEnv = async (): Promise<ConfigEnv> => {
  const root = await mkdtemp(join(tmpdir(), "pocketpatch-cli-runtime-"));
  const home = join(root, "home");

  await mkdir(home, { recursive: true });

  return {
    HOME: home,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_STATE_HOME: join(root, "state"),
  };
};

describe("CLI runtime", () => {
  test("does not initialize storage for config-only commands", async () => {
    const env = await makeTempEnv();
    const paths = await resolveConfigPaths(env);
    const result = await runPocketPatchCli(["config", "show"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Config: ${paths.configFile}`);
    await expect(exists(paths.stateDb)).resolves.toBe(false);
  });

  test("does not initialize storage for daemon planning", async () => {
    const env = await makeTempEnv();
    const paths = await resolveConfigPaths(env);
    const result = await runPocketPatchCli(["daemon", "plan"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("127.0.0.1:3217");
    await expect(exists(paths.stateDb)).resolves.toBe(false);
  });

  test("does not initialize storage for daemon start help", async () => {
    const env = await makeTempEnv();
    const paths = await resolveConfigPaths(env);
    const result = await runPocketPatchCli(["daemon", "start", "--help"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE");
    await expect(exists(paths.stateDb)).resolves.toBe(false);
  });

  test("does not initialize storage for register help", async () => {
    const env = await makeTempEnv();
    const paths = await resolveConfigPaths(env);
    const result = await runPocketPatchCli(["register", "--help"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE");
    await expect(exists(paths.stateDb)).resolves.toBe(false);
  });
});
