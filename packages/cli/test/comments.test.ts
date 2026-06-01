import type { Comment, Project } from "@pocketpatch/storage";
import { describe, expect, test } from "vitest";
import { formatProjectComments } from "../src/comments";

const project: Project = {
  createdAt: "2026-05-31T12:00:00.000Z",
  id: 1,
  lastSeenAt: "2026-05-31T12:00:00.000Z",
  path: "/home/k/code/pocketpatch",
};

const comment = (input: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  body: "Prefer the Effect helper here.",
  createdAt: "2026-05-31T12:00:00.000Z",
  filePath: "packages/daemon/src/index.ts",
  newLineNumber: 353,
  oldLineNumber: null,
  projectId: 1,
  resolvedAt: null,
  ...input,
});

describe("comment formatting", () => {
  test("formats comments grouped by file in deterministic line order", () => {
    expect(
      formatProjectComments(project, [
        comment({
          body: "This branch should be tested.",
          id: 2,
          newLineNumber: 354,
          resolvedAt: "2026-05-31T12:03:00.000Z",
        }),
        comment({
          body: "Prefer the Effect helper here.",
          id: 1,
          newLineNumber: 353,
        }),
        comment({
          body: "This name is unclear.\nMaybe use projectContext.",
          filePath: "packages/cli/src/index.ts",
          id: 3,
          newLineNumber: 42,
        }),
      ]),
    ).toBe(
      [
        "PocketPatch comments for /home/k/code/pocketpatch (project 1)",
        "",
        "packages/cli/src/index.ts",
        "- new 42 (comment 3)",
        "  This name is unclear.",
        "  Maybe use projectContext.",
        "",
        "packages/daemon/src/index.ts",
        "- new 353 (comment 1)",
        "  Prefer the Effect helper here.",
        "- new 354 (comment 2) [resolved]",
        "  This branch should be tested.",
        "",
      ].join("\n"),
    );
  });

  test("formats old/new and empty comment sets", () => {
    expect(
      formatProjectComments(project, [
        comment({
          id: 1,
          newLineNumber: 59,
          oldLineNumber: 43,
        }),
        comment({
          id: 2,
          newLineNumber: null,
          oldLineNumber: 17,
        }),
      ]),
    ).toContain("- old 17 (comment 2)");
    expect(formatProjectComments(project, [])).toBe(
      "No comments for /home/k/code/pocketpatch (project 1)\n",
    );
  });
});
