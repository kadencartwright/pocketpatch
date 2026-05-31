import { describe, expect, test } from "bun:test";
import { GitCommandError, GitService } from "@pocketpatch/git";
import { ProjectNotFoundError, StorageService } from "@pocketpatch/storage";
import { Effect, Layer } from "effect";
import * as Daemon from "../src/index";

const StorageTest = Layer.succeed(StorageService, {
  getProject: (projectId) =>
    projectId === 1
      ? Effect.succeed({
          createdAt: "2026-05-29T12:00:00.000Z",
          id: 1,
          lastSeenAt: "2026-05-29T12:00:00.000Z",
          path: "/home/k/code/pocketpatch",
        })
      : Effect.fail(new ProjectNotFoundError({ projectId })),
  registerProject: (path) =>
    Effect.succeed({
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-29T12:00:00.000Z",
      path,
    }),
});

const GitTest = Layer.succeed(GitService, {
  inspectRepository: ({ path }) =>
    Effect.succeed({
      diffs: [
        {
          binary: false,
          hunks: [
            {
              header: "",
              lines: [
                {
                  content: "export const value = 2;",
                  kind: "add" as const,
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
          path: "tracked.ts",
          status: "modified" as const,
          truncated: false,
        },
      ],
      files: [
        {
          oldPath: null,
          path: "tracked.ts",
          status: "modified" as const,
        },
      ],
      path,
      ref: {
        branch: "main",
        displayName: "main",
        head: "0123456789abcdef0123456789abcdef01234567",
      },
    }),
});

describe("daemon HTTP handler", () => {
  test("DaemonHttpService handles requests through an Effect layer", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/health"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
    });
  });

  test("DaemonHttpService registers projects", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects", {
            body: JSON.stringify({ path: "/home/k/code/pocketpatch" }),
            headers: {
              "content-type": "application/json",
            },
            method: "POST",
          }),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(201);
    const body = await response.json();

    expect(body.project).toEqual({
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-29T12:00:00.000Z",
      path: "/home/k/code/pocketpatch",
    });
    expect(new URL(body.reviewUrl).pathname).toBe("/projects/1");
  });

  test("DaemonHttpService uses forwarded host headers when building review URLs", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects", {
            body: JSON.stringify({ path: "/home/k/code/pocketpatch" }),
            headers: {
              "content-type": "application/json",
              host: "127.0.0.1:3217",
              "x-forwarded-proto": "http",
            },
            method: "POST",
          }),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      project: {
        createdAt: "2026-05-29T12:00:00.000Z",
        id: 1,
        lastSeenAt: "2026-05-29T12:00:00.000Z",
        path: "/home/k/code/pocketpatch",
      },
      reviewUrl: "http://127.0.0.1:3217/projects/1",
    });
  });

  test("DaemonHttpService rejects malformed project registration requests", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects", {
            body: JSON.stringify({ path: "" }),
            headers: {
              "content-type": "application/json",
            },
            method: "POST",
          }),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(400);
  });

  test("DaemonHttpService gets a project by id", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects/1"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project: {
        createdAt: "2026-05-29T12:00:00.000Z",
        id: 1,
        lastSeenAt: "2026-05-29T12:00:00.000Z",
        path: "/home/k/code/pocketpatch",
      },
    });
  });

  test("DaemonHttpService returns 404 for missing projects", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects/404"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(404);
  });

  test("DaemonHttpService gets project diffs", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects/1/diff"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
          path: "tracked.ts",
          status: "modified",
          truncated: false,
        },
      ],
      files: [
        {
          oldPath: null,
          path: "tracked.ts",
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
    });
  });

  test("DaemonHttpService returns 404 for missing project diffs", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects/404/diff"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(404);
  });

  test("DaemonHttpService maps git inspection failures to 500", async () => {
    const GitFailingTest = Layer.succeed(GitService, {
      inspectRepository: ({ path }) =>
        Effect.fail(
          new GitCommandError({
            args: ["status"],
            cause: "boom",
            cwd: path,
          }),
        ),
    });
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(
          new Request("http://127.0.0.1:3217/projects/1/diff"),
        );
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(GitFailingTest),
        Effect.provide(StorageTest),
      ),
    );

    expect(response.status).toBe(500);
  });
});
