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
  readonly anchorLineContent: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly filePath: string;
  readonly id: number;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
  readonly projectId: number;
  readonly resolvedAt: string | null;
};

export type CreateCommentInput = {
  readonly anchorLineContent: string | null;
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
  readonly anchor_line_content: string | null;
  readonly body: string;
  readonly created_at: string;
  readonly file_path: string;
  readonly id: number;
  readonly new_line_number: number | null;
  readonly old_line_number: number | null;
  readonly project_id: number;
  readonly resolved_at: string | null;
};

export type ListCommentsOptions = {
  readonly showResolved?: boolean;
};

const toProject = (row: ProjectRow): Project => ({
  createdAt: row.created_at,
  id: row.id,
  lastSeenAt: row.last_seen_at,
  path: row.path,
});

const toComment = (row: CommentRow): Comment => ({
  anchorLineContent: row.anchor_line_content,
  body: row.body,
  createdAt: row.created_at,
  filePath: row.file_path,
  id: row.id,
  newLineNumber: row.new_line_number,
  oldLineNumber: row.old_line_number,
  projectId: row.project_id,
  resolvedAt: row.resolved_at,
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
      resolved_at TEXT,
      anchor_line_content TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

type TableColumnRow = {
  readonly name: string;
};

const ensureCommentsColumn = (
  sql: SqlClient.SqlClient,
  name: string,
  definition: string,
): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<TableColumnRow>`PRAGMA table_info(comments)`;
    const exists = rows.some((row) => row.name === name);

    if (!exists) {
      yield* sql.unsafe(`ALTER TABLE comments ADD COLUMN ${definition}`);
    }
  });

export const migrateCommentMetadata = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    yield* ensureCommentsColumn(sql, "resolved_at", "resolved_at TEXT");
    yield* ensureCommentsColumn(
      sql,
      "anchor_line_content",
      "anchor_line_content TEXT",
    );
  });

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
        anchor_line_content,
        created_at
      )
      VALUES (
        ${input.projectId},
        ${input.filePath},
        ${input.oldLineNumber},
        ${input.newLineNumber},
        ${input.body},
        ${input.anchorLineContent},
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      RETURNING
        id,
        project_id,
        file_path,
        old_line_number,
        new_line_number,
        body,
        created_at,
        resolved_at,
        anchor_line_content
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
  options: ListCommentsOptions = {},
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
        created_at,
        resolved_at,
        anchor_line_content
      FROM comments
      WHERE project_id = ${projectId}
        AND (${options.showResolved === true ? 1 : 0} = 1 OR resolved_at IS NULL)
      ORDER BY id ASC
    `,
    (rows) => rows.map(toComment),
  );

export const resolveComment = (
  sql: SqlClient.SqlClient,
  projectId: number,
  commentId: number,
): Effect.Effect<Comment, CommentNotFoundError | SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<CommentRow>`
      UPDATE comments
      SET resolved_at = COALESCE(
        resolved_at,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      WHERE project_id = ${projectId}
        AND id = ${commentId}
      RETURNING
        id,
        project_id,
        file_path,
        old_line_number,
        new_line_number,
        body,
        created_at,
        resolved_at,
        anchor_line_content
    `;
    const row = rows[0];

    if (row === undefined) {
      return yield* Effect.fail(
        new CommentNotFoundError({ commentId, projectId }),
      );
    }

    return toComment(row);
  });

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
      options?: ListCommentsOptions,
    ) => Effect.Effect<ReadonlyArray<Comment>, SqlError>;
    readonly registerProject: (
      path: string,
    ) => Effect.Effect<Project, SqlError>;
    readonly resolveComment: (
      projectId: number,
      commentId: number,
    ) => Effect.Effect<Comment, CommentNotFoundError | SqlError>;
  }
>() {}

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* migrateProjects(sql);
    yield* migrateComments(sql);
    yield* migrateCommentMetadata(sql);

    return {
      createComment: (input) => createComment(sql, input),
      deleteComment: (projectId, commentId) =>
        deleteComment(sql, projectId, commentId),
      getProject: (projectId) => getProject(sql, projectId),
      listProjects: listProjects(sql),
      listComments: (projectId, options) =>
        listComments(sql, projectId, options),
      registerProject: (path) => registerProject(sql, path),
      resolveComment: (projectId, commentId) =>
        resolveComment(sql, projectId, commentId),
    };
  }),
);
