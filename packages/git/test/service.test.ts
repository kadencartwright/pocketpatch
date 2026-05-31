import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import * as Git from "../src/index";

const execFileAsync = promisify(execFile);

const git = async (cwd: string, args: ReadonlyArray<string>) => {
  await execFileAsync("git", [...args], { cwd });
};

const makeRepository = async () => {
  const path = await mkdtemp(join(tmpdir(), "pocketpatch-git-service-"));

  await git(path, ["init", "-b", "main"]);
  await git(path, ["config", "user.email", "pocketpatch@example.test"]);
  await git(path, ["config", "user.name", "PocketPatch"]);
  await writeFile(join(path, "tracked.ts"), "export const value = 1;\n");
  await git(path, ["add", "."]);
  await git(path, ["commit", "-m", "initial"]);
  await writeFile(join(path, "tracked.ts"), "export const value = 2;\n");

  return path;
};

describe("GitService", () => {
  test("delegates repository inspection through an Effect service", async () => {
    const path = await makeRepository();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* Git.GitService;

        return yield* git.inspectRepository({
          path,
        });
      }).pipe(Effect.provide(Git.GitServiceLive)),
    );

    expect(result.path).toBe(path);
    expect(result.files).toEqual([
      {
        oldPath: null,
        path: "tracked.ts",
        status: "modified",
      },
    ]);
  });
});
