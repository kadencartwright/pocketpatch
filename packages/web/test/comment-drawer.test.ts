import { describe, expect, test } from "bun:test";
import {
  buildCommentDrawerTarget,
  commentDrawerCompactLabel,
  commentDrawerLineLabel,
  lineNumberFormValue,
} from "../src/lib/comment-drawer";

describe("comment drawer target", () => {
  test("builds the drawer target from a tapped new line", () => {
    expect(
      buildCommentDrawerTarget({
        filePath: "src/example.ts",
        line: {
          content: "export const value = 2;",
          newLineNumber: 156,
          oldLineNumber: null,
        },
      }),
    ).toEqual({
      anchorLineContent: "export const value = 2;",
      filePath: "src/example.ts",
      key: "src/example.ts:new:156",
      newLineNumber: 156,
      oldLineNumber: null,
    });
  });

  test("labels old, new, and unchanged lines", () => {
    expect(
      commentDrawerLineLabel({ newLineNumber: 156, oldLineNumber: null }),
    ).toBe("new 156");
    expect(
      commentDrawerLineLabel({ newLineNumber: null, oldLineNumber: 88 }),
    ).toBe("old 88");
    expect(
      commentDrawerLineLabel({ newLineNumber: 156, oldLineNumber: 88 }),
    ).toBe("old 88, new 156");
  });

  test("builds a compact drawer target label", () => {
    expect(
      commentDrawerCompactLabel({
        filePath: "packages/cli/test/comments.test.ts",
        newLineNumber: 501,
        oldLineNumber: 444,
      }),
    ).toBe("comments.test.ts:501");
    expect(
      commentDrawerCompactLabel({
        filePath: "README.md",
        newLineNumber: null,
        oldLineNumber: null,
      }),
    ).toBe("README.md");
  });

  test("serializes nullable line numbers for form posts", () => {
    expect(lineNumberFormValue(156)).toBe("156");
    expect(lineNumberFormValue(null)).toBe("");
  });
});
