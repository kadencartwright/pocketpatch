import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  OpenApi,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { GitService } from "@pocketpatch/git";
import {
  CommentNotFoundError,
  ProjectNotFoundError,
  StorageService,
} from "@pocketpatch/storage";
import { Effect, Layer } from "effect";
import { describe, expect, test } from "vitest";
import * as Daemon from "../src/index";

const StorageTest = Layer.succeed(StorageService, {
  createComment: (input) =>
    Effect.succeed({
      ...input,
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      resolvedAt: null,
    }),
  deleteComment: (projectId, commentId) =>
    commentId === 1
      ? Effect.void
      : Effect.fail(new CommentNotFoundError({ commentId, projectId })),
  getProject: (projectId) =>
    projectId === 1
      ? Effect.succeed({
          createdAt: "2026-05-29T12:00:00.000Z",
          id: 1,
          lastSeenAt: "2026-05-29T12:00:00.000Z",
          path: "/home/k/code/pocketpatch",
        })
      : Effect.fail(new ProjectNotFoundError({ projectId })),
  listComments: (projectId, options) =>
    Effect.succeed([
      {
        anchorLineContent: "const value = 1;",
        body: "Prefer the Effect helper here.",
        createdAt: "2026-05-29T12:00:00.000Z",
        filePath: "packages/daemon/src/index.ts",
        id: 1,
        newLineNumber: 353,
        oldLineNumber: null,
        projectId,
        resolvedAt: null,
      },
      ...(options?.showResolved === true
        ? [
            {
              anchorLineContent: "const oldValue = 1;",
              body: "Resolved comment.",
              createdAt: "2026-05-29T12:01:00.000Z",
              filePath: "packages/daemon/src/index.ts",
              id: 2,
              newLineNumber: 354,
              oldLineNumber: null,
              projectId,
              resolvedAt: "2026-05-29T12:02:00.000Z",
            },
          ]
        : []),
    ]),
  listProjects: Effect.succeed([]),
  registerProject: (path) =>
    Effect.succeed({
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-29T12:00:00.000Z",
      path,
    }),
  resolveComment: (projectId, commentId) =>
    commentId === 1
      ? Effect.succeed({
          anchorLineContent: "const value = 1;",
          body: "Prefer the Effect helper here.",
          createdAt: "2026-05-29T12:00:00.000Z",
          filePath: "packages/daemon/src/index.ts",
          id: 1,
          newLineNumber: 353,
          oldLineNumber: null,
          projectId,
          resolvedAt: "2026-05-29T12:02:00.000Z",
        })
      : Effect.fail(new CommentNotFoundError({ commentId, projectId })),
});

const GitTest = Layer.succeed(GitService, {
  inspectRepository: ({ path }) =>
    Effect.succeed({
      diffs: [
        {
          availability: "available" as const,
          binary: false,
          hunks: [],
          oldPath: null,
          path: "tracked.ts",
          status: "modified",
        },
      ],
      files: [
        {
          availability: "available" as const,
          oldPath: null,
          path: "tracked.ts",
          status: "modified",
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

describe("daemon Effect HTTP app", () => {
  test("declares the current routes in the PocketPatch HttpApi contract", () => {
    const spec = OpenApi.fromApi(Daemon.PocketPatchApi);

    expect(Object.keys(spec.paths).sort()).toEqual([
      "/health",
      "/projects",
      "/projects/{id}",
      "/projects/{id}/comments",
      "/projects/{id}/comments/{commentId}",
      "/projects/{id}/comments/{commentId}/resolve",
      "/projects/{id}/diff",
    ]);
  });

  test("serves GET /health through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.get("/health");
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.HealthResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          ok: true,
        });
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("serves POST /projects through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClientRequest.post("/projects").pipe(
          HttpClientRequest.bodyJson({ path: "/home/k/code/pocketpatch" }),
          Effect.flatMap(HttpClient.execute),
        );
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.ProjectRegistrationResponseSchema,
        )(response);

        expect(response.status).toBe(201);
        expect(body.project).toEqual({
          createdAt: "2026-05-29T12:00:00.000Z",
          id: 1,
          lastSeenAt: "2026-05-29T12:00:00.000Z",
          path: "/home/k/code/pocketpatch",
        });
        expect(new URL(body.reviewUrl).pathname).toBe("/projects/1");
        expect(body.reviewUrl.startsWith("http://127.0.0.1:")).toBe(true);
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("serves GET /projects/:id through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.get("/projects/1");
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.ProjectResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          project: {
            createdAt: "2026-05-29T12:00:00.000Z",
            id: 1,
            lastSeenAt: "2026-05-29T12:00:00.000Z",
            path: "/home/k/code/pocketpatch",
          },
        });
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("serves GET /projects/:id/diff through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.get("/projects/1/diff");
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.ProjectDiffResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          diffs: [
            {
              availability: "available",
              binary: false,
              hunks: [],
              oldPath: null,
              path: "tracked.ts",
              status: "modified",
            },
          ],
          files: [
            {
              availability: "available",
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
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(GitTest),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("times out slow project diff inspections", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Daemon.inspectProjectDiffSnapshot({
          git: {
            inspectRepository: () => Effect.never,
          },
          project: {
            createdAt: "2026-05-29T12:00:00.000Z",
            id: 1,
            lastSeenAt: "2026-05-29T12:00:00.000Z",
            path: "/home/k/code/pocketpatch",
          },
          projectId: 1,
          timeoutMs: 1,
        }),
      ),
    );

    expect(error).toMatchObject({
      _tag: "ProjectDiffInspectionTimeoutError",
      projectId: 1,
      timeoutMs: 1,
    });
  });

  test("serves comments through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.get("/projects/1/comments");
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.CommentListResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body.comments).toEqual([
          {
            anchorLineContent: "const value = 1;",
            body: "Prefer the Effect helper here.",
            createdAt: "2026-05-29T12:00:00.000Z",
            filePath: "packages/daemon/src/index.ts",
            id: 1,
            newLineNumber: 353,
            oldLineNumber: null,
            projectId: 1,
            resolvedAt: null,
          },
        ]);
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("serves resolved comments when requested through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.get(
          "/projects/1/comments?showResolved=true",
        );
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.CommentListResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body.comments).toHaveLength(2);
        expect(body.comments[1]?.resolvedAt).toBe("2026-05-29T12:02:00.000Z");
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("creates comments through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClientRequest.post(
          "/projects/1/comments",
        ).pipe(
          HttpClientRequest.bodyJson({
            anchorLineContent: "const value = 1;",
            body: "Prefer the Effect helper here.",
            filePath: "packages/daemon/src/index.ts",
            newLineNumber: 353,
            oldLineNumber: null,
          }),
          Effect.flatMap(HttpClient.execute),
        );
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.CommentResponseSchema,
        )(response);

        expect(response.status).toBe(201);
        expect(body.comment).toEqual({
          anchorLineContent: "const value = 1;",
          body: "Prefer the Effect helper here.",
          createdAt: "2026-05-29T12:00:00.000Z",
          filePath: "packages/daemon/src/index.ts",
          id: 1,
          newLineNumber: 353,
          oldLineNumber: null,
          projectId: 1,
          resolvedAt: null,
        });
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("resolves comments through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.execute(
          HttpClientRequest.post("/projects/1/comments/1/resolve"),
        );
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.CommentResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body.comment).toEqual({
          anchorLineContent: "const value = 1;",
          body: "Prefer the Effect helper here.",
          createdAt: "2026-05-29T12:00:00.000Z",
          filePath: "packages/daemon/src/index.ts",
          id: 1,
          newLineNumber: 353,
          oldLineNumber: null,
          projectId: 1,
          resolvedAt: "2026-05-29T12:02:00.000Z",
        });
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });

  test("deletes comments through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* HttpClient.execute(
          HttpClientRequest.del("/projects/1/comments/1"),
        );
        const body = yield* HttpClientResponse.schemaBodyJson(
          Daemon.DeleteCommentResponseSchema,
        )(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          deleted: true,
        });
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServerLive),
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest),
      ),
    );

    await Effect.runPromise(program);
  });
});
