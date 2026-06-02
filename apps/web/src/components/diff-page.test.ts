import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SkippedDiffFile } from "./diff-page";

describe("DiffPage skipped rows", () => {
  test("renders skipped generated directory rows compactly", () => {
    const html = renderToStaticMarkup(
      createElement(SkippedDiffFile, {
        file: {
          availability: "skipped",
          fileCount: 18203,
          oldPath: null,
          path: ".pnpm-store/",
          reason: "generated_directory",
          status: "untracked",
        },
      }),
    );

    expect(html).toContain("SKIPPED");
    expect(html).toContain(".pnpm-store/");
    expect(html).toContain("18,203 files skipped");
  });

  test("renders skipped large file rows compactly", () => {
    const html = renderToStaticMarkup(
      createElement(SkippedDiffFile, {
        file: {
          availability: "skipped",
          byteCount: 240_000_000,
          oldPath: null,
          path: "data/export.json",
          reason: "large_file",
          status: "untracked",
        },
      }),
    );

    expect(html).toContain("data/export.json");
    expect(html).toContain("240 MB file skipped");
  });
});
