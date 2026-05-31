import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql/SqlError";
import { Context, Effect, Layer, Schema } from "effect";

export type Project = {
  readonly createdAt: string;
  readonly id: number;
  readonly lastSeenAt: string;
  readonly path: string;
};

export type Comment = {
  readonly body: string;
  readonly createdAt: string;
  readonly filePath: string;
  readonly id: number;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
  readonly projectId: number;
};

export type CreateCommentInput = {
  readonly body: string;
  readonly filePath: string;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
  readonly projectId: number;
};

type ProjectRow = {
  readonly created_at: string;
  readonly id: number;
  readonly last_seen_at: string;
  readonly path: string;
};

type CommentRow = {
  readonly body: string;
  readonly created_at: string;
  readonly file_path: string;
  readonly id: number;
  readonly new_line_number: number | null;
  readonly old_line_number: number | null;
  readonly project_id: number;
};

const toProject = (row: ProjectRow): Project => ({
  createdAt: row.created_at,
  id: row.id,
  lastSeenAt: row.last_seen_at,
  path: row.path,
});

const toComment = (row: CommentRow): Comment => ({
  body: row.body,
  createdAt: row.created_at,
  filePath: row.file_path,
  id: row.id,
  newLineNumber: row.new_line_number,
  oldLineNumber: row.old_line_number,
  projectId: row.project_id,
});

export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    projectId: Schema.Number,
  },
) {
  override get message(): string {
    return `Project ${this.projectId} was not found`;
  }
}

export class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    commentId: Schema.Number,
    projectId: Schema.Number,
  },
) {
  override get message(): string {
    return `Comment ${this.commentId} was not found for project ${this.projectId}`;
  }
}

export const migrateProjects = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError> =>
  Effect.asVoid(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `);

export const migrateComments = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError> =>
  Effect.asVoid(sql`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      old_line_number INTEGER,
      new_line_number INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

export const registerProject = (
  sql: SqlClient.SqlClient,
  path: string,
): Effect.Effect<Project, SqlError> =>
  Effect.gen(function* () {
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

export const createComment = (
  sql: SqlClient.SqlClient,
  input: CreateCommentInput,
): Effect.Effect<Comment, SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<CommentRow>`
      INSERT INTO comments (
        project_id,
        file_path,
        old_line_number,
        new_line_number,
        body,
        created_at
      )
      VALUES (
        ${input.projectId},
        ${input.filePath},
        ${input.oldLineNumber},
        ${input.newLineNumber},
        ${input.body},
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      RETURNING
        id,
        project_id,
        file_path,
        old_line_number,
        new_line_number,
        body,
        created_at
    `;
    const row = rows[0];

    if (row === undefined) {
      return yield* Effect.dieMessage("createComment returned no rows");
    }

    return toComment(row);
  });

export const listComments = (
  sql: SqlClient.SqlClient,
  projectId: number,
): Effect.Effect<ReadonlyArray<Comment>, SqlError> =>
  Effect.map(
    sql<CommentRow>`
      SELECT
        id,
        project_id,
        file_path,
        old_line_number,
        new_line_number,
        body,
        created_at
      FROM comments
      WHERE project_id = ${projectId}
      ORDER BY id ASC
    `,
    (rows) => rows.map(toComment),
  );

export const deleteComment = (
  sql: SqlClient.SqlClient,
  projectId: number,
  commentId: number,
): Effect.Effect<void, CommentNotFoundError | SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: number }>`
      DELETE FROM comments
      WHERE project_id = ${projectId}
        AND id = ${commentId}
      RETURNING id
    `;

    if (rows[0] === undefined) {
      return yield* Effect.fail(
        new CommentNotFoundError({ commentId, projectId }),
      );
    }
  });

export const getProject = (
  sql: SqlClient.SqlClient,
  projectId: number,
): Effect.Effect<Project, ProjectNotFoundError | SqlError> =>
  Effect.gen(function* () {
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

export const listProjects = (
  sql: SqlClient.SqlClient,
): Effect.Effect<ReadonlyArray<Project>, SqlError> =>
  Effect.map(
    sql<ProjectRow>`
      SELECT id, path, created_at, last_seen_at
      FROM projects
      ORDER BY last_seen_at DESC, id DESC
    `,
    (rows) => rows.map(toProject),
  );

export class StorageService extends Context.Tag(
  "@pocketpatch/storage/StorageService",
)<
  StorageService,
  {
    readonly createComment: (
      input: CreateCommentInput,
    ) => Effect.Effect<Comment, SqlError>;
    readonly deleteComment: (
      projectId: number,
      commentId: number,
    ) => Effect.Effect<void, CommentNotFoundError | SqlError>;
    readonly getProject: (
      projectId: number,
    ) => Effect.Effect<Project, ProjectNotFoundError | SqlError>;
    readonly listProjects: Effect.Effect<ReadonlyArray<Project>, SqlError>;
    readonly listComments: (
      projectId: number,
    ) => Effect.Effect<ReadonlyArray<Comment>, SqlError>;
    readonly registerProject: (
      path: string,
    ) => Effect.Effect<Project, SqlError>;
  }
>() {}

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* migrateProjects(sql);
    yield* migrateComments(sql);

    return {
      createComment: (input) => createComment(sql, input),
      deleteComment: (projectId, commentId) =>
        deleteComment(sql, projectId, commentId),
      getProject: (projectId) => getProject(sql, projectId),
      listProjects: listProjects(sql),
      listComments: (projectId) => listComments(sql, projectId),
      registerProject: (path) => registerProject(sql, path),
    };
  }),
);
