import { describe, expect, test } from "bun:test";
import {
  buildProjectDiffUrl,
  createDiffViewModel,
  fetchProjectDiff,
} from "../src/lib/diff-client";

const sampleDiff = {
  diffs: [
    {
      binary: false,
      hunks: [
        {
          header: "",
          lines: [
            {
              content: "export const value = 2;",
              kind: "add",
              newLineNumber: 1,
              oldLineNumber: null,
            },
          ],
          newLines: 1,
          newStart: 1,
          oldLines: 0,
          oldStart: 0,
        },
      ],
      oldPath: null,
      path: "src/example.ts",
      status: "modified",
      truncated: false,
    },
    {
      binary: true,
      hunks: [],
      oldPath: null,
      path: "image.png",
      status: "modified",
      truncated: false,
    },
  ],
  files: [
    {
      oldPath: null,
      path: "src/example.ts",
      status: "modified",
    },
    {
      oldPath: null,
      path: "image.png",
      status: "modified",
    },
  ],
  project: {
    createdAt: "2026-05-29T12:00:00.000Z",
    id: 1,
    lastSeenAt: "2026-05-29T12:00:00.000Z",
    path: "/home/k/code/pocketpatch",
  },
  ref: {
    branch: "main",
    displayName: "main",
    head: "0123456789abcdef0123456789abcdef01234567",
  },
};

describe("diff client", () => {
  test("builds daemon project diff URLs", () => {
    expect(buildProjectDiffUrl("http://127.0.0.1:3217", "42")).toBe(
      "http://127.0.0.1:3217/projects/42/diff",
    );
  });

  test("fetches project diffs from the daemon", async () => {
    const response = await fetchProjectDiff({
      daemonBaseUrl: "http://daemon.test",
      fetch: async (input) =>
        new Response(JSON.stringify({ ...sampleDiff, requestedUrl: input }), {
          headers: {
            "content-type": "application/json",
          },
        }),
      projectId: "1",
    });

    expect(response.project.id).toBe(1);
    expect(response.diffs).toHaveLength(2);
  });

  test("fails clearly when the daemon returns an error", async () => {
    await expect(
      fetchProjectDiff({
        daemonBaseUrl: "http://daemon.test",
        fetch: async () => new Response("Not found", { status: 404 }),
        projectId: "404",
      }),
    ).rejects.toThrow("Failed to load project diff: 404");
  });

  test("creates a compact view model for the read-only diff page", () => {
    expect(createDiffViewModel(sampleDiff)).toEqual({
      binaryCount: 1,
      changedFileCount: 2,
      displayRef: "main",
      lineCount: 1,
      projectPath: "/home/k/code/pocketpatch",
    });
  });
});
