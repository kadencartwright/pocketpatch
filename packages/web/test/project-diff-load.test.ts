import { describe, expect, test } from "bun:test";
import { loadProjectDiff } from "../src/lib/project-diff-load";

describe("project diff loader", () => {
  test("loads diff data and summary for a project", async () => {
    const result = await loadProjectDiff({
      daemonBaseUrl: "http://daemon.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            diffs: [],
            files: [
              {
                oldPath: null,
                path: "src/example.ts",
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
          }),
        ),
      projectId: "1",
    });

    expect(result.summary).toEqual({
      binaryCount: 0,
      changedFileCount: 1,
      displayRef: "main",
      lineCount: 0,
      projectPath: "/home/k/code/pocketpatch",
    });
    expect(result.diff.files).toHaveLength(1);
    expect(result.highlightedDiff.files).toHaveLength(1);
  });
});
