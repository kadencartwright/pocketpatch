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
  const path = await mkdtemp(join(tmpdir(), "pocketpatch-git-"));

  await git(path, ["init", "-b", "main"]);
  await git(path, ["config", "user.email", "pocketpatch@example.test"]);
  await git(path, ["config", "user.name", "PocketPatch"]);
  await writeFile(join(path, "tracked.ts"), "export const value = 1;\n");
  await writeFile(join(path, "rename-me.txt"), "before\n");
  await writeFile(join(path, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  await git(path, ["add", "."]);
  await git(path, ["commit", "-m", "initial"]);

  return path;
};

describe("git repository inspection", () => {
  test("identifies the checked out ref and changed files", async () => {
    const path = await makeRepository();

    await writeFile(join(path, "tracked.ts"), "export const value = 2;\n");
    await git(path, ["mv", "rename-me.txt", "renamed.txt"]);
    await writeFile(join(path, "untracked.md"), "# New file\n");

    const snapshot = await Effect.runPromise(Git.inspectRepository({ path }));

    expect(snapshot.ref.branch).toBe("main");
    expect(snapshot.ref.head).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.ref.displayName).toBe("main");
    expect(snapshot.files).toEqual([
      {
        path: "renamed.txt",
        oldPath: "rename-me.txt",
        status: "renamed",
      },
      {
        path: "tracked.ts",
        oldPath: null,
        status: "modified",
      },
      {
        path: "untracked.md",
        oldPath: null,
        status: "untracked",
      },
    ]);
  });

  test("produces structured text diffs for tracked and untracked files", async () => {
    const path = await makeRepository();

    await writeFile(join(path, "tracked.ts"), "export const value = 2;\n");
    await writeFile(join(path, "untracked.md"), "# New file\n");

    const snapshot = await Effect.runPromise(Git.inspectRepository({ path }));

    expect(snapshot.diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binary: false,
          hunks: [
            expect.objectContaining({
              lines: expect.arrayContaining([
                {
                  content: "export const value = 1;",
                  kind: "delete",
                  newLineNumber: null,
                  oldLineNumber: 1,
                },
                {
                  content: "export const value = 2;",
                  kind: "add",
                  newLineNumber: 1,
                  oldLineNumber: null,
                },
              ]),
            }),
          ],
          oldPath: null,
          path: "tracked.ts",
          status: "modified",
          truncated: false,
        }),
        expect.objectContaining({
          binary: false,
          hunks: [
            expect.objectContaining({
              lines: [
                {
                  content: "# New file",
                  kind: "add",
                  newLineNumber: 1,
                  oldLineNumber: null,
                },
              ],
            }),
          ],
          oldPath: null,
          path: "untracked.md",
          status: "untracked",
          truncated: false,
        }),
      ]),
    );
  });

  test("marks binary diffs and renamed files", async () => {
    const path = await makeRepository();

    await writeFile(join(path, "binary.bin"), Buffer.from([0, 1, 2, 4]));
    await git(path, ["mv", "rename-me.txt", "renamed.txt"]);

    const snapshot = await Effect.runPromise(Git.inspectRepository({ path }));

    expect(snapshot.diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binary: true,
          hunks: [],
          oldPath: null,
          path: "binary.bin",
          status: "modified",
        }),
        expect.objectContaining({
          binary: false,
          oldPath: "rename-me.txt",
          path: "renamed.txt",
          status: "renamed",
        }),
      ]),
    );
  });

  test("truncates large text diffs at the configured line limit", async () => {
    const path = await makeRepository();
    const lines = Array.from({ length: 50 }, (_, index) => `line ${index}`);

    await writeFile(join(path, "untracked-large.txt"), `${lines.join("\n")}\n`);

    const snapshot = await Effect.runPromise(
      Git.inspectRepository({
        maxFileDiffLines: 5,
        path,
      }),
    );
    const diff = snapshot.diffs.find(
      (candidate) => candidate.path === "untracked-large.txt",
    );

    expect(diff?.truncated).toBe(true);
    expect(diff?.hunks.flatMap((hunk) => hunk.lines)).toHaveLength(5);
  });
});
