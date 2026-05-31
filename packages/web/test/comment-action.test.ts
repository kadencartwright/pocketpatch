import { describe, expect, test } from "bun:test";
import {
  createCommentAction,
  resolveCommentAction,
} from "../src/lib/comment-action";

describe("comment action", () => {
  test("creates a project comment from form data", async () => {
    const requests: Array<{ body: unknown; input: RequestInfo | URL }> = [];
    const form = new FormData();

    form.set("body", "Prefer the Effect helper here.");
    form.set("filePath", "src/example.ts");
    form.set("anchorLineContent", "export const value = 2;");
    form.set("newLineNumber", "1");
    form.set("oldLineNumber", "");

    const result = await createCommentAction({
      daemonBaseUrl: "http://daemon.test",
      fetch: async (input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          input,
        });

        return new Response(
          JSON.stringify({
            comment: {
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
          }),
        );
      },
      form,
      projectId: "1",
    });

    expect(requests).toEqual([
      {
        body: {
          anchorLineContent: "export const value = 2;",
          body: "Prefer the Effect helper here.",
          filePath: "src/example.ts",
          newLineNumber: 1,
          oldLineNumber: null,
        },
        input: "http://daemon.test/projects/1/comments",
      },
    ]);
    expect(result).toEqual({
      comment: {
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
      ok: true,
    });
  });

  test("rejects empty comments before calling the daemon", async () => {
    const form = new FormData();

    form.set("body", " ");
    form.set("filePath", "src/example.ts");
    form.set("anchorLineContent", "export const value = 2;");
    form.set("newLineNumber", "1");
    form.set("oldLineNumber", "");

    const result = await createCommentAction({
      daemonBaseUrl: "http://daemon.test",
      fetch: async () => {
        throw new Error("fetch should not be called");
      },
      form,
      projectId: "1",
    });

    expect(result).toEqual({
      error: "Comment is required",
      ok: false,
    });
  });

  test("resolves a project comment", async () => {
    const requests: Array<RequestInfo | URL> = [];
    const form = new FormData();

    form.set("commentId", "1");

    const result = await resolveCommentAction({
      daemonBaseUrl: "http://daemon.test",
      fetch: async (input, init) => {
        requests.push(input);
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            comment: {
              anchorLineContent: "export const value = 2;",
              body: "Prefer the Effect helper here.",
              createdAt: "2026-05-29T12:00:00.000Z",
              filePath: "src/example.ts",
              id: 1,
              newLineNumber: 1,
              oldLineNumber: null,
              projectId: 1,
              resolvedAt: "2026-05-29T12:01:00.000Z",
            },
          }),
        );
      },
      form,
      projectId: "1",
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      "http://daemon.test/projects/1/comments/1/resolve",
    ]);
  });
});
