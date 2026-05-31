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
});
