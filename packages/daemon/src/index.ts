import { createServer } from "node:http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  HttpServer,
  type HttpServerRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { ProjectNotFoundError, StorageService } from "@pocketpatch/storage";
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

type ProjectRegistrationResponse =
  typeof ProjectRegistrationResponseSchema.Type;
type ProjectResponse = typeof ProjectResponseSchema.Type;

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
          const project = yield* storage
            .getProject(path.id)
            .pipe(
              Effect.catchAll((error) =>
                error instanceof ProjectNotFoundError
                  ? Effect.fail(new ProjectHttpNotFound({ id: path.id }))
                  : Effect.die(error),
              ),
            );

          return makeProjectResponse(project);
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
    const apiLive = PocketPatchApiLive.pipe(
      Layer.provide(Layer.succeed(StorageService, storage)),
    );
    const apiHandler = HttpApiBuilder.toWebHandler(
      Layer.mergeAll(apiLive, HttpServer.layerContext),
    );

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => apiHandler.dispose()),
    );

    return {
      handle: (request) => Effect.promise(() => apiHandler.handler(request)),
    };
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
        Layer.build(DaemonHttpServerLive).pipe(
          Effect.provideService(StorageService, storage),
          Effect.provide(
            NodeHttpServer.layer(() => createServer(), {
              host: endpoint.address,
              port: endpoint.port,
            }),
          ),
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
