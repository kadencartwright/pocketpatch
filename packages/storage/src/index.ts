import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql/SqlError";
import { Context, Effect, Layer, Schema } from "effect";

export type Project = {
  readonly createdAt: string;
  readonly id: number;
  readonly lastSeenAt: string;
  readonly path: string;
};

type ProjectRow = {
  readonly created_at: string;
  readonly id: number;
  readonly last_seen_at: string;
  readonly path: string;
};

const toProject = (row: ProjectRow): Project => ({
  createdAt: row.created_at,
  id: row.id,
  lastSeenAt: row.last_seen_at,
  path: row.path
});

export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    projectId: Schema.Number
  }
) {
  override get message(): string {
    return `Project ${this.projectId} was not found`;
  }
}

export const migrateProjects = (
  sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
  Effect.asVoid(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `);

export const registerProject = (
  sql: SqlClient.SqlClient,
  path: string
): Effect.Effect<Project, SqlError> =>
  Effect.gen(function*() {
    const rows = yield* sql<ProjectRow>`
      INSERT INTO projects (path, created_at, last_seen_at)
      VALUES (
        ${path},
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      ON CONFLICT(path) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
      RETURNING id, path, created_at, last_seen_at
    `;
    const row = rows[0];

    if (row === undefined) {
      return yield* Effect.dieMessage("registerProject returned no rows");
    }

    return toProject(row);
  });

export const getProject = (
  sql: SqlClient.SqlClient,
  projectId: number
): Effect.Effect<Project, ProjectNotFoundError | SqlError> =>
  Effect.gen(function*() {
    const rows = yield* sql<ProjectRow>`
      SELECT id, path, created_at, last_seen_at
      FROM projects
      WHERE id = ${projectId}
      LIMIT 1
    `;
    const row = rows[0];

    if (row === undefined) {
      return yield* Effect.fail(new ProjectNotFoundError({ projectId }));
    }

    return toProject(row);
  });

export class StorageService extends Context.Tag("@pocketpatch/storage/StorageService")<
  StorageService,
  {
    readonly getProject: (projectId: number) => Effect.Effect<Project, ProjectNotFoundError | SqlError>;
    readonly registerProject: (path: string) => Effect.Effect<Project, SqlError>;
  }
>() {}

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient;

    yield* migrateProjects(sql);

    return {
      getProject: (projectId) => getProject(sql, projectId),
      registerProject: (path) => registerProject(sql, path)
    };
  })
);
