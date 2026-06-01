import { describe, expect, test } from "vitest";
import { attachCommentsToCurrentDiff, commentLineKey } from "./comment-anchor";
import type {
  FileDiff,
  ProjectComment,
  ProjectDiffResponse,
} from "./diff-client";

const project = {
  createdAt: "2026-05-31T00:00:00.000Z",
  id: 1,
  lastSeenAt: "2026-05-31T00:00:00.000Z",
  path: "/repo",
};

const ref = {
  branch: "main",
  displayName: "main",
  head: "abc123",
};

const comment = (override: Partial<ProjectComment> = {}): ProjectComment => ({
  anchorLineContent: "return save(input)",
  body: "Should validate before saving.",
  createdAt: "2026-05-31T00:00:00.000Z",
  filePath: "src/form.ts",
  id: 1,
  newLineNumber: 42,
  oldLineNumber: null,
  projectId: 1,
  resolvedAt: null,
  ...override,
});

const diff = (file: FileDiff): ProjectDiffResponse => ({
  diffs: [file],
  files: [
    {
      oldPath: file.oldPath,
      path: file.path,
      status: file.status,
    },
  ],
  project,
  ref,
});

const fileDiff = (override: Partial<FileDiff> = {}): FileDiff => ({
  binary: false,
  hunks: [
    {
      header: "",
      lines: [
        {
          content: "return save(input)",
          kind: "add",
          newLineNumber: 42,
          oldLineNumber: null,
        },
      ],
      newLines: 1,
      newStart: 42,
      oldLines: 0,
      oldStart: 41,
    },
  ],
  oldPath: null,
  path: "src/form.ts",
  status: "modified",
  truncated: false,
  ...override,
});

describe("comment anchors", () => {
  test("keeps comments when their original line is still in the current diff", () => {
    const [anchored] = attachCommentsToCurrentDiff(diff(fileDiff()), [
      comment(),
    ]);

    expect(anchored).toMatchObject({
      id: 1,
      lineKey: "src/form.ts:new:42",
      newLineNumber: 42,
      oldLineNumber: null,
    });
  });

  test("hides comments when their file is no longer touched", () => {
    const anchored = attachCommentsToCurrentDiff(
      {
        ...diff(fileDiff()),
        diffs: [],
        files: [],
      },
      [comment()],
    );

    expect(anchored).toEqual([]);
  });

  test("moves comments to the nearest matching anchor line", () => {
    const [anchored] = attachCommentsToCurrentDiff(
      diff(
        fileDiff({
          hunks: [
            {
              header: "",
              lines: [
                {
                  content: "return save(input)",
                  kind: "add",
                  newLineNumber: 91,
                  oldLineNumber: null,
                },
              ],
              newLines: 1,
              newStart: 91,
              oldLines: 0,
              oldStart: 90,
            },
          ],
        }),
      ),
      [comment()],
    );

    expect(anchored).toMatchObject({
      id: 1,
      lineKey: "src/form.ts:new:91",
      newLineNumber: 91,
      oldLineNumber: null,
    });
  });

  test("hides comments when the anchor text is gone from the current diff", () => {
    const anchored = attachCommentsToCurrentDiff(
      diff(
        fileDiff({
          hunks: [
            {
              header: "",
              lines: [
                {
                  content: "return save(validate(input))",
                  kind: "add",
                  newLineNumber: 42,
                  oldLineNumber: null,
                },
              ],
              newLines: 1,
              newStart: 42,
              oldLines: 0,
              oldStart: 41,
            },
          ],
        }),
      ),
      [comment()],
    );

    expect(anchored).toEqual([]);
  });

  test("uses the current line key for regrouping relocated comments", () => {
    const [anchored] = attachCommentsToCurrentDiff(
      diff(
        fileDiff({
          hunks: [
            {
              header: "",
              lines: [
                {
                  content: "return save(input)",
                  kind: "add",
                  newLineNumber: 75,
                  oldLineNumber: null,
                },
              ],
              newLines: 1,
              newStart: 75,
              oldLines: 0,
              oldStart: 74,
            },
          ],
        }),
      ),
      [comment()],
    );

    expect(anchored).toBeDefined();
    if (anchored === undefined) {
      return;
    }

    expect(commentLineKey(anchored)).toBe("src/form.ts:new:75");
    expect(anchored?.lineKey).toBe("src/form.ts:new:75");
  });
});
