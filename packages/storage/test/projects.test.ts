import { describe, expect, test } from "bun:test";
import { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Cause, Effect, Either, Exit } from "effect";
import * as Storage from "../src/index";

const SqliteMemory = SqliteClient.layer({
  filename: ":memory:",
});

const runStorage = <A, E>(
  effect: Effect.Effect<A, E, Storage.StorageService | SqlClient.SqlClient>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Storage.StorageServiceLive),
      Effect.provide(SqliteMemory),
    ),
  );

describe("project storage", () => {
  test("registers a project path", async () => {
    const project = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;

        return yield* storage.registerProject("/home/k/code/pocketpatch");
      }),
    );

    expect(project.id).toBe(1);
    expect(project.path).toBe("/home/k/code/pocketpatch");
    expect(project.createdAt).toBeString();
    expect(project.lastSeenAt).toBeString();
  });

  test("registering the same path returns the existing project and updates last_seen_at", async () => {
    const result = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const first = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );
        const second = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql`SELECT * FROM projects`;

        return { first, rows, second };
      }),
    );

    expect(result.second.id).toBe(result.first.id);
    expect(result.second.path).toBe(result.first.path);
    expect(result.rows).toHaveLength(1);
  });

  test("gets a registered project by id", async () => {
    const result = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const registered = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );

        return yield* storage.getProject(registered.id);
      }),
    );

    expect(result).toEqual({
      createdAt: expect.any(String),
      id: 1,
      lastSeenAt: expect.any(String),
      path: "/home/k/code/pocketpatch",
    });
  });

  test("lists registered projects by last seen time, newest first", async () => {
    const result = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const first = yield* storage.registerProject("/home/k/code/first");
        const second = yield* storage.registerProject("/home/k/code/second");
        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          UPDATE projects
          SET last_seen_at = '2026-05-30T12:00:00.000Z'
          WHERE id = ${second.id}
        `;
        yield* sql`
          UPDATE projects
          SET last_seen_at = '2026-05-31T12:00:00.000Z'
          WHERE id = ${first.id}
        `;

        return {
          first,
          projects: yield* storage.listProjects,
          second,
        };
      }),
    );

    expect(result.projects.map((project) => project.path)).toEqual([
      result.first.path,
      result.second.path,
    ]);
  });

  test("fails with ProjectNotFoundError when a project id is missing", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;

        return yield* storage.getProject(404);
      }).pipe(
        Effect.provide(Storage.StorageServiceLive),
        Effect.provide(SqliteMemory),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOrCause(exit.cause);

      expect(Either.isLeft(failure)).toBe(true);
      if (Either.isLeft(failure)) {
        expect(failure.left).toBeInstanceOf(Storage.ProjectNotFoundError);
        expect(failure.left.projectId).toBe(404);
      }
    }
  });

  test("creates and lists comments for a project", async () => {
    const result = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const project = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );
        const otherProject =
          yield* storage.registerProject("/home/k/code/other");
        const first = yield* storage.createComment({
          body: "Prefer the Effect helper here.",
          filePath: "packages/daemon/src/index.ts",
          newLineNumber: 353,
          oldLineNumber: null,
          projectId: project.id,
        });
        const second = yield* storage.createComment({
          body: "This branch should be tested.",
          filePath: "packages/daemon/src/index.ts",
          newLineNumber: 354,
          oldLineNumber: null,
          projectId: project.id,
        });

        yield* storage.createComment({
          body: "Other project comment.",
          filePath: "README.md",
          newLineNumber: 1,
          oldLineNumber: null,
          projectId: otherProject.id,
        });

        const comments = yield* storage.listComments(project.id);

        return { comments, first, second };
      }),
    );

    expect(result.first).toEqual({
      body: "Prefer the Effect helper here.",
      createdAt: expect.any(String),
      filePath: "packages/daemon/src/index.ts",
      id: 1,
      newLineNumber: 353,
      oldLineNumber: null,
      projectId: 1,
    });
    expect(result.comments).toEqual([result.first, result.second]);
  });

  test("deletes comments by project id and comment id", async () => {
    const result = await runStorage(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const project = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );
        const comment = yield* storage.createComment({
          body: "Remove this.",
          filePath: "packages/daemon/src/index.ts",
          newLineNumber: 353,
          oldLineNumber: null,
          projectId: project.id,
        });

        yield* storage.deleteComment(project.id, comment.id);

        return yield* storage.listComments(project.id);
      }),
    );

    expect(result).toEqual([]);
  });

  test("fails with CommentNotFoundError when deleting a missing comment", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const storage = yield* Storage.StorageService;
        const project = yield* storage.registerProject(
          "/home/k/code/pocketpatch",
        );

        return yield* storage.deleteComment(project.id, 404);
      }).pipe(
        Effect.provide(Storage.StorageServiceLive),
        Effect.provide(SqliteMemory),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOrCause(exit.cause);

      expect(Either.isLeft(failure)).toBe(true);
      if (Either.isLeft(failure)) {
        expect(failure.left).toBeInstanceOf(Storage.CommentNotFoundError);
        expect(failure.left.commentId).toBe(404);
      }
    }
  });
});
