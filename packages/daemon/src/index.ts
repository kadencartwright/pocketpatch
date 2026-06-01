import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  HttpApp,
  HttpServer,
  type HttpServerRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import {
  ChangedFileSchema,
  FileDiffSchema,
  GitCommandError,
  GitRefSchema,
  GitService,
  GitServiceLive,
} from "@pocketpatch/git";
import { NetworkService } from "@pocketpatch/network";
import {
  CommentNotFoundError,
  ProjectNotFoundError,
  StorageService,
} from "@pocketpatch/storage";
import type { Scope } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

export type DaemonEndpoint = {
  readonly address: string;
  readonly port: number;
};

export const DaemonEndpointSchema = Schema.Struct({
  address: Schema.String,
  port: Schema.Number,
});

export type DaemonStartupPlan = {
  readonly endpoints: ReadonlyArray<DaemonEndpoint>;
};

export const HealthResponseSchema = Schema.Struct({
  ok: Schema.Boolean,
});

export const RegisterProjectRequestSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1)),
});

export const ProjectSchema = Schema.Struct({
  createdAt: Schema.String,
  id: Schema.Number,
  lastSeenAt: Schema.String,
  path: Schema.String,
});

export const ProjectRegistrationResponseSchema = Schema.Struct({
  project: ProjectSchema,
  reviewUrl: Schema.String,
});

export const ProjectResponseSchema = Schema.Struct({
  project: ProjectSchema,
});

export const ProjectDiffResponseSchema = Schema.Struct({
  diffs: Schema.Array(FileDiffSchema),
  files: Schema.Array(ChangedFileSchema),
  project: ProjectSchema,
  ref: GitRefSchema,
});

export const CommentSchema = Schema.Struct({
  anchorLineContent: Schema.NullOr(Schema.String),
  body: Schema.String,
  createdAt: Schema.String,
  filePath: Schema.String,
  id: Schema.Number,
  newLineNumber: Schema.NullOr(Schema.Number),
  oldLineNumber: Schema.NullOr(Schema.Number),
  projectId: Schema.Number,
  resolvedAt: Schema.NullOr(Schema.String),
});

export const ListCommentsRequestSchema = Schema.Struct({
  showResolved: Schema.optionalWith(Schema.BooleanFromString, {
    default: () => false,
  }),
});

export const CreateCommentRequestSchema = Schema.Struct({
  anchorLineContent: Schema.NullOr(Schema.String),
  body: Schema.String.pipe(Schema.minLength(1)),
  filePath: Schema.String.pipe(Schema.minLength(1)),
  newLineNumber: Schema.NullOr(Schema.Number),
  oldLineNumber: Schema.NullOr(Schema.Number),
});

export const CommentResponseSchema = Schema.Struct({
  comment: CommentSchema,
});

export const CommentListResponseSchema = Schema.Struct({
  comments: Schema.Array(CommentSchema),
});

export const DeleteCommentResponseSchema = Schema.Struct({
  deleted: Schema.Boolean,
});

type ProjectRegistrationResponse =
  typeof ProjectRegistrationResponseSchema.Type;
type ProjectResponse = typeof ProjectResponseSchema.Type;
type ProjectDiffResponse = typeof ProjectDiffResponseSchema.Type;
type CommentResponse = typeof CommentResponseSchema.Type;
type CommentListResponse = typeof CommentListResponseSchema.Type;
type DeleteCommentResponse = typeof DeleteCommentResponseSchema.Type;
type StorageServiceShape = Context.Tag.Service<typeof StorageService>;

export const planDaemonStartup = (env: ConfigEnv) =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const networkService = yield* NetworkService;
    const config = yield* configService.load(env);
    const listenAddresses =
      yield* networkService.computeListenAddresses(config);

    return {
      endpoints: listenAddresses.map((address) => ({
        address,
        port: config.network.port,
      })),
    };
  });

const makeProjectReviewUrl = (origin: string, projectId: number): string =>
  new URL(`/projects/${projectId}`, origin).toString();

const makeProjectRegistrationResponse = (
  origin: string,
  project: typeof ProjectSchema.Type,
): ProjectRegistrationResponse => ({
  project,
  reviewUrl: makeProjectReviewUrl(origin, project.id),
});

const makeProjectResponse = (
  project: typeof ProjectSchema.Type,
): ProjectResponse => ({
  project,
});

const makeProjectDiffResponse = (
  project: typeof ProjectSchema.Type,
  snapshot: {
    readonly diffs: ReadonlyArray<typeof FileDiffSchema.Type>;
    readonly files: ReadonlyArray<typeof ChangedFileSchema.Type>;
    readonly ref: typeof GitRefSchema.Type;
  },
): ProjectDiffResponse => ({
  diffs: snapshot.diffs,
  files: snapshot.files,
  project,
  ref: snapshot.ref,
});

const makeCommentResponse = (
  comment: typeof CommentSchema.Type,
): CommentResponse => ({
  comment,
});

const makeCommentListResponse = (
  comments: ReadonlyArray<typeof CommentSchema.Type>,
): CommentListResponse => ({
  comments,
});

const makeDeleteCommentResponse = (): DeleteCommentResponse => ({
  deleted: true,
});

const getProjectOrHttpNotFound = (
  storage: StorageServiceShape,
  projectId: number,
) =>
  storage
    .getProject(projectId)
    .pipe(
      Effect.catchAll((error) =>
        error instanceof ProjectNotFoundError
          ? Effect.fail(new ProjectHttpNotFound({ id: projectId }))
          : Effect.die(error),
      ),
    );

const deleteCommentOrHttpNotFound = (
  storage: StorageServiceShape,
  projectId: number,
  commentId: number,
) =>
  storage
    .deleteComment(projectId, commentId)
    .pipe(
      Effect.catchAll((error) =>
        error instanceof CommentNotFoundError
          ? Effect.fail(new CommentHttpNotFound({ commentId, projectId }))
          : Effect.die(error),
      ),
    );

const resolveCommentOrHttpNotFound = (
  storage: StorageServiceShape,
  projectId: number,
  commentId: number,
) =>
  storage
    .resolveComment(projectId, commentId)
    .pipe(
      Effect.catchAll((error) =>
        error instanceof CommentNotFoundError
          ? Effect.fail(new CommentHttpNotFound({ commentId, projectId }))
          : Effect.die(error),
      ),
    );

const originFromServerRequest = (
  request: HttpServerRequest.HttpServerRequest,
): string => {
  if (request.url.startsWith("http://") || request.url.startsWith("https://")) {
    return new URL(request.url).origin;
  }

  const protocol = request.headers["x-forwarded-proto"] ?? "http";
  const host = request.headers.host ?? "localhost";

  return `${protocol}://${host}`;
};

export class ProjectHttpNotFound extends Schema.TaggedClass<ProjectHttpNotFound>()(
  "ProjectHttpNotFound",
  {
    id: Schema.Number,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class ProjectDiffInspectionError extends Schema.TaggedClass<ProjectDiffInspectionError>()(
  "ProjectDiffInspectionError",
  {
    message: Schema.String,
    projectId: Schema.Number,
  },
  HttpApiSchema.annotations({ status: 500 }),
) {}

export class CommentHttpNotFound extends Schema.TaggedClass<CommentHttpNotFound>()(
  "CommentHttpNotFound",
  {
    commentId: Schema.Number,
    projectId: Schema.Number,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class HealthApi extends HttpApiGroup.make("health", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health")`/health`.addSuccess(HealthResponseSchema),
) {}

export class ProjectsApi extends HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.post("register")`/projects`
      .setPayload(RegisterProjectRequestSchema)
      .addSuccess(ProjectRegistrationResponseSchema, { status: 201 }),
  )
  .add(
    HttpApiEndpoint.get(
      "get",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}`
      .addSuccess(ProjectResponseSchema)
      .addError(ProjectHttpNotFound),
  )
  .add(
    HttpApiEndpoint.get(
      "diff",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}/diff`
      .addSuccess(ProjectDiffResponseSchema)
      .addError(ProjectHttpNotFound)
      .addError(ProjectDiffInspectionError),
  )
  .add(
    HttpApiEndpoint.get(
      "listComments",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}/comments`
      .setPayload(ListCommentsRequestSchema)
      .addSuccess(CommentListResponseSchema)
      .addError(ProjectHttpNotFound),
  )
  .add(
    HttpApiEndpoint.post(
      "createComment",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}/comments`
      .setPayload(CreateCommentRequestSchema)
      .addSuccess(CommentResponseSchema, { status: 201 })
      .addError(ProjectHttpNotFound),
  )
  .add(
    HttpApiEndpoint.post(
      "resolveComment",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}/comments/${HttpApiSchema.param("commentId", Schema.NumberFromString)}/resolve`
      .addSuccess(CommentResponseSchema)
      .addError(ProjectHttpNotFound)
      .addError(CommentHttpNotFound),
  )
  .add(
    HttpApiEndpoint.del(
      "deleteComment",
    )`/projects/${HttpApiSchema.param("id", Schema.NumberFromString)}/comments/${HttpApiSchema.param("commentId", Schema.NumberFromString)}`
      .addSuccess(DeleteCommentResponseSchema)
      .addError(ProjectHttpNotFound)
      .addError(CommentHttpNotFound),
  ) {}

export class PocketPatchApi extends HttpApi.make("pocketpatch")
  .add(HealthApi)
  .add(ProjectsApi) {}

const HealthApiLive = HttpApiBuilder.group(
  PocketPatchApi,
  "health",
  (handlers) =>
    handlers.handle("health", () =>
      Effect.succeed({
        ok: true,
      }),
    ),
);

const ProjectsApiLive = HttpApiBuilder.group(
  PocketPatchApi,
  "projects",
  (handlers) =>
    handlers
      .handle("register", ({ payload, request }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;
          const project = yield* storage
            .registerProject(payload.path)
            .pipe(Effect.orDie);

          return makeProjectRegistrationResponse(
            originFromServerRequest(request),
            project,
          );
        }),
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;
          const project = yield* getProjectOrHttpNotFound(storage, path.id);

          return makeProjectResponse(project);
        }),
      )
      .handle("diff", ({ path }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;
          const git = yield* GitService;
          const project = yield* getProjectOrHttpNotFound(storage, path.id);
          const snapshot = yield* git
            .inspectRepository({
              path: project.path,
            })
            .pipe(
              Effect.catchAll((error) =>
                error instanceof GitCommandError
                  ? Effect.fail(
                      new ProjectDiffInspectionError({
                        message: error.message,
                        projectId: path.id,
                      }),
                    )
                  : Effect.die(error),
              ),
            );

          return makeProjectDiffResponse(project, snapshot);
        }),
      )
      .handle("listComments", ({ path, payload }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;

          yield* getProjectOrHttpNotFound(storage, path.id);
          const comments = yield* storage
            .listComments(path.id, {
              showResolved: payload.showResolved,
            })
            .pipe(Effect.orDie);

          return makeCommentListResponse(comments);
        }),
      )
      .handle("createComment", ({ path, payload }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;

          yield* getProjectOrHttpNotFound(storage, path.id);
          const comment = yield* storage
            .createComment({
              ...payload,
              projectId: path.id,
            })
            .pipe(Effect.orDie);

          return makeCommentResponse(comment);
        }),
      )
      .handle("resolveComment", ({ path }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;

          yield* getProjectOrHttpNotFound(storage, path.id);
          const comment = yield* resolveCommentOrHttpNotFound(
            storage,
            path.id,
            path.commentId,
          );

          return makeCommentResponse(comment);
        }),
      )
      .handle("deleteComment", ({ path }) =>
        Effect.gen(function* () {
          const storage = yield* StorageService;

          yield* getProjectOrHttpNotFound(storage, path.id);
          yield* deleteCommentOrHttpNotFound(storage, path.id, path.commentId);

          return makeDeleteCommentResponse();
        }),
      ),
);

export const PocketPatchApiLive = Layer.provide(
  HttpApiBuilder.api(PocketPatchApi),
  [HealthApiLive, ProjectsApiLive],
);

export const DaemonHttpServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(PocketPatchApiLive),
);

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultWebAssetRoots = [
  join(moduleDir, "web"),
  join(moduleDir, "../../../apps/web/dist"),
  join(process.cwd(), "apps/web/dist"),
];

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const isApiPath = (pathname: string): boolean =>
  pathname === "/api" || pathname.startsWith("/api/");

const stripApiPrefix = (request: Request): Request => {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice("/api".length) || "/";

  return new Request(url.toString(), request as RequestInit);
};

const responseWithNotFound = () =>
  new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });

const firstExistingRoot = async (
  roots: ReadonlyArray<string>,
): Promise<string | null> => {
  for (const root of roots) {
    try {
      const rootStat = await stat(root);

      if (rootStat.isDirectory()) {
        return root;
      }
    } catch {
      // Try the next candidate root.
    }
  }

  return null;
};

const filePathForRequest = (root: string, pathname: string): string => {
  const requestedPath = decodeURIComponent(pathname);
  const relativePath =
    requestedPath === "/" || extname(requestedPath) === ""
      ? "index.html"
      : requestedPath.replace(/^\/+/, "");
  const normalizedPath = normalize(relativePath).replace(
    /^(\.\.(\/|\\|$))+/,
    "",
  );

  return join(root, normalizedPath);
};

export const makeStaticWebHandler =
  (webAssetRoots: ReadonlyArray<string> = defaultWebAssetRoots) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return responseWithNotFound();
    }

    const root = await firstExistingRoot(webAssetRoots);

    if (root === null) {
      return responseWithNotFound();
    }

    const url = new URL(request.url);
    const filePath = filePathForRequest(root, url.pathname);

    try {
      const file = await readFile(filePath);
      const type =
        contentTypes[extname(filePath)] ?? "application/octet-stream";

      return new Response(request.method === "HEAD" ? null : file, {
        headers: {
          "cache-control": filePath.endsWith("index.html")
            ? "no-cache"
            : "public, max-age=31536000, immutable",
          "content-type": type,
        },
      });
    } catch {
      return responseWithNotFound();
    }
  };

export class DaemonHttpService extends Context.Tag(
  "@pocketpatch/daemon/DaemonHttpService",
)<
  DaemonHttpService,
  {
    readonly handle: (request: Request) => Effect.Effect<Response>;
  }
>() {}

export const DaemonHttpServiceLive = Layer.scoped(
  DaemonHttpService,
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const git = yield* GitService;
    const apiLive = PocketPatchApiLive.pipe(
      Layer.provide(Layer.succeed(StorageService, storage)),
      Layer.provide(Layer.succeed(GitService, git)),
    );
    const apiHandler = HttpApiBuilder.toWebHandler(
      Layer.mergeAll(apiLive, HttpServer.layerContext),
    );

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => apiHandler.dispose()),
    );

    const staticWebHandler = makeStaticWebHandler();

    return {
      handle: (request) =>
        Effect.promise(() =>
          isApiPath(new URL(request.url).pathname)
            ? apiHandler.handler(stripApiPrefix(request))
            : staticWebHandler(request),
        ),
    };
  }),
);

export const DaemonPublicHttpServerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const service = yield* DaemonHttpService;

    yield* HttpServer.serveEffect(
      HttpApp.fromWebHandler((request) =>
        Effect.runPromise(service.handle(request)),
      ),
    );
  }),
);

export class DaemonServerBindError extends Schema.TaggedError<DaemonServerBindError>()(
  "DaemonServerBindError",
  {
    cause: Schema.Unknown,
    endpoint: DaemonEndpointSchema,
  },
) {
  override get message(): string {
    return `Failed to bind daemon server at ${this.endpoint.address}:${this.endpoint.port}`;
  }
}

export class DaemonServerFactory extends Context.Tag(
  "@pocketpatch/daemon/DaemonServerFactory",
)<
  DaemonServerFactory,
  {
    readonly bind: (
      endpoint: DaemonEndpoint,
    ) => Effect.Effect<void, DaemonServerBindError, Scope.Scope>;
  }
>() {}

export const startDaemonServer = (endpoint: DaemonEndpoint) =>
  Effect.gen(function* () {
    const factory = yield* DaemonServerFactory;

    yield* factory.bind(endpoint);
  });

export const startDaemonServers = (plan: DaemonStartupPlan) =>
  Effect.forEach(plan.endpoints, startDaemonServer, {
    discard: true,
  });

export const DaemonServerFactoryLive = Layer.effect(
  DaemonServerFactory,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    return {
      bind: (endpoint) =>
        DaemonPublicHttpServerLive.pipe(
          Layer.provide(DaemonHttpServiceLive),
          Layer.provide(Layer.succeed(StorageService, storage)),
          Layer.provide(GitServiceLive),
          Layer.provide(
            NodeHttpServer.layer(() => createServer(), {
              host: endpoint.address,
              port: endpoint.port,
            }),
          ),
          Layer.launch,
          Effect.forkScoped,
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DaemonServerBindError({
                cause,
                endpoint,
              }),
          ),
        ),
    };
  }),
);

export const startDaemon = (env: ConfigEnv) =>
  Effect.flatMap(planDaemonStartup(env), startDaemonServers);

export const startDaemonForeground = (env: ConfigEnv) =>
  Effect.scoped(startDaemon(env).pipe(Effect.zipRight(Effect.never)));

export class DaemonControlService extends Context.Tag(
  "@pocketpatch/daemon/DaemonControlService",
)<
  DaemonControlService,
  {
    readonly plan: typeof planDaemonStartup;
    readonly start: typeof startDaemonForeground;
  }
>() {}

export const DaemonControlServiceLive = Layer.succeed(DaemonControlService, {
  plan: planDaemonStartup,
  start: startDaemonForeground,
});
