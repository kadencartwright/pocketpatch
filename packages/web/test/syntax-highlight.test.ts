import { describe, expect, test } from "bun:test";
import {
  detectLanguageForPath,
  highlightProjectDiff,
} from "../src/lib/syntax-highlight";

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
} as const;

describe("syntax highlighting", () => {
  test("detects common languages by path", () => {
    expect(detectLanguageForPath("src/App.svelte")).toBe("svelte");
    expect(detectLanguageForPath("packages/web/vite.config.ts")).toBe(
      "typescript",
    );
    expect(detectLanguageForPath("biome.json")).toBe("json");
    expect(detectLanguageForPath("Dockerfile")).toBe("dockerfile");
    expect(detectLanguageForPath("unknown.extension")).toBeNull();
  });

  test("adds Shiki tokens to diff lines", async () => {
    const highlighted = await highlightProjectDiff(sampleDiff);
    const tokens = highlighted.diffs[0]?.hunks[0]?.lines[0]?.tokens ?? [];

    expect(tokens.map((token) => token.content).join("")).toBe(
      "export const value = 2;",
    );
    expect(tokens.some((token) => token.color !== null)).toBe(true);
  });
});
