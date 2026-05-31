import { describe, expect, test } from "bun:test";
import { loadProjectDiff } from "../src/lib/project-diff-load";

describe("project diff loader", () => {
  test("loads diff data and summary for a project", async () => {
    const result = await loadProjectDiff({
      daemonBaseUrl: "http://daemon.test",
      fetch: async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("/comments")
              ? {
                  comments: [
                    {
                      anchorLineContent: "export const value = 2;",
                      body: "Prefer the Effect helper here.",
                      createdAt: "2026-05-29T12:00:00.000Z",
                      filePath: "src/example.ts",
                      id: 1,
                      newLineNumber: 1,
                      oldLineNumber: null,
                      projectId: 1,
                      resolvedAt: null,
                    },
                    {
                      anchorLineContent: "export const value = 2;",
                      body: "Already handled.",
                      createdAt: "2026-05-29T12:00:30.000Z",
                      filePath: "src/example.ts",
                      id: 3,
                      newLineNumber: 1,
                      oldLineNumber: null,
                      projectId: 1,
                      resolvedAt: "2026-05-29T12:02:00.000Z",
                    },
                    {
                      anchorLineContent: "missing line",
                      body: "This is stale.",
                      createdAt: "2026-05-29T12:01:00.000Z",
                      filePath: "src/missing.ts",
                      id: 2,
                      newLineNumber: 10,
                      oldLineNumber: null,
                      projectId: 1,
                      resolvedAt: null,
                    },
                  ],
                }
              : {
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
                  ],
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
                },
          ),
        ),
      projectId: "1",
    });

    expect(result.summary).toEqual({
      binaryCount: 0,
      changedFileCount: 1,
      displayRef: "main",
      lineCount: 1,
      projectPath: "/home/k/code/pocketpatch",
    });
    expect(result.diff.files).toHaveLength(1);
    expect(result.highlightedDiff.files).toHaveLength(1);
    expect(result.commentsByLine["src/example.ts:new:1"]).toHaveLength(1);
    expect(result.commentsByLine["src/example.ts:new:1"]?.[0]?.stale).toBe(
      false,
    );
    expect(result.commentsByLine["src/example.ts:new:1"]?.[0]?.id).toBe(1);
    expect(result.unresolvedComments.map((comment) => comment.id)).toEqual([
      1, 2,
    ]);
    expect(result.resolvedComments.map((comment) => comment.id)).toEqual([3]);
    expect(result.comments[2]?.stale).toBe(true);
  });

  test("loads all comments for the overview without a route option", async () => {
    const requestedUrls: Array<string> = [];

    await loadProjectDiff({
      daemonBaseUrl: "http://daemon.test",
      fetch: async (input) => {
        requestedUrls.push(String(input));

        return new Response(
          JSON.stringify(
            String(input).includes("/comments")
              ? { comments: [] }
              : {
                  diffs: [],
                  files: [],
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
                },
          ),
        );
      },
      projectId: "1",
    });

    expect(requestedUrls).toContain(
      "http://daemon.test/projects/1/comments?showResolved=true",
    );
  });
});
