import { describe, expect, test } from "bun:test";
import {
  buildCommentDraftKey,
  type CommentDraftStorage,
  readCommentDraft,
  removeCommentDraft,
  writeCommentDraft,
} from "../src/lib/comment-draft";

const makeStorage = (): CommentDraftStorage => {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

describe("comment drafts", () => {
  test("builds a project-scoped line draft key", () => {
    expect(
      buildCommentDraftKey({
        lineKey: "src/example.ts:new:3",
        projectId: 1,
      }),
    ).toBe("pocketpatch.commentDraft.v1:1:src%2Fexample.ts%3Anew%3A3");
  });

  test("stores and reads a partial comment without trimming it", () => {
    const storage = makeStorage();
    const key = buildCommentDraftKey({
      lineKey: "src/example.ts:new:3",
      projectId: 1,
    });

    writeCommentDraft(storage, key, "  partial note\n");

    expect(readCommentDraft(storage, key)).toBe("  partial note\n");
  });

  test("removes empty or saved drafts", () => {
    const storage = makeStorage();
    const key = buildCommentDraftKey({
      lineKey: "src/example.ts:new:3",
      projectId: 1,
    });

    writeCommentDraft(storage, key, "partial note");
    writeCommentDraft(storage, key, "");

    expect(readCommentDraft(storage, key)).toBe("");

    writeCommentDraft(storage, key, "partial note");
    removeCommentDraft(storage, key);

    expect(readCommentDraft(storage, key)).toBe("");
  });
});
