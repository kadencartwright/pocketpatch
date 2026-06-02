import { describe, expect, test, vi } from "vitest";
import {
  createDiffViewModel,
  fetchProjectDiff,
  type ProjectDiffResponse,
} from "./diff-client";

const project = {
  createdAt: "2026-05-29T12:00:00.000Z",
  id: 1,
  lastSeenAt: "2026-05-29T12:00:00.000Z",
  path: "/repo",
};

const ref = {
  branch: "main",
  displayName: "main",
  head: "0123456789abcdef0123456789abcdef01234567",
};

describe("diff client", () => {
  test("summarizes available rows without counting skipped rows as lines", () => {
    const summary = createDiffViewModel({
      diffs: [
        {
          availability: "available",
          binary: false,
          hunks: [
            {
              header: "",
              lines: [
                {
                  content: "one",
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
          path: "src/app.ts",
          status: "modified",
        },
        {
          availability: "skipped",
          fileCount: 18203,
          oldPath: null,
          path: ".pnpm-store/",
          reason: "generated_directory",
          status: "untracked",
        },
      ],
      files: [
        {
          availability: "available",
          oldPath: null,
          path: "src/app.ts",
          status: "modified",
        },
        {
          availability: "skipped",
          oldPath: null,
          path: ".pnpm-store/",
          status: "untracked",
        },
      ],
      project,
      ref,
    } satisfies ProjectDiffResponse);

    expect(summary).toMatchObject({
      changedFileCount: 2,
      lineCount: 1,
      skippedCount: 1,
    });
  });

  test("times out project diff fetches", async () => {
    vi.useFakeTimers();

    const fetchMock: typeof fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }) as ReturnType<typeof fetch>,
    );
    const promise = fetchProjectDiff({
      daemonBaseUrl: "http://127.0.0.1:3217/api",
      fetch: fetchMock,
      projectId: "1",
      timeoutMs: 10,
    });
    const assertion = expect(promise).rejects.toThrow(
      "Timed out loading project diff",
    );

    await vi.advanceTimersByTimeAsync(10);

    await assertion;
    vi.useRealTimers();
  });
});
