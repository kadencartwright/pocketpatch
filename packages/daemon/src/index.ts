import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { StorageService } from "@pocketpatch/storage";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Context, Effect, Layer, Schema } from "effect";
import type { Scope } from "effect";
import { createServer } from "node:http";

export type DaemonEndpoint = {
  readonly address: string;
  readonly port: number;
};

export type DaemonStartupPlan = {
  readonly endpoints: ReadonlyArray<DaemonEndpoint>;
};

export const HealthResponseSchema = Schema.Struct({
  ok: Schema.Boolean
});

export const RegisterProjectRequestSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1))
});

export const ProjectSchema = Schema.Struct({
  createdAt: Schema.String,
  id: Schema.Number,
  lastSeenAt: Schema.String,
  path: Schema.String
});

export const ProjectRegistrationResponseSchema = Schema.Struct({
  project: ProjectSchema,
  reviewUrl: Schema.String
});

type ProjectRegistrationResponse = typeof ProjectRegistrationResponseSchema.Type;

export const planDaemonStartup = (env: ConfigEnv) =>
  Effect.gen(function*() {
    const configService = yield* ConfigService;
    const networkService = yield* NetworkService;
    const config = yield* configService.load(env);
    const listenAddresses = yield* networkService.computeListenAddresses(config);

    return {
      endpoints: listenAddresses.map((address) => ({
        address,
        port: config.network.port
      }))
    };
  });

export const handleDaemonRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
};

const makeProjectReviewUrl = (
  origin: string,
  projectId: number
): string =>
  new URL(`/projects/${projectId}`, origin).toString();

const makeProjectRegistrationResponse = (
  origin: string,
  project: typeof ProjectSchema.Type
): ProjectRegistrationResponse => ({
  project,
  reviewUrl: makeProjectReviewUrl(origin, project.id)
});

const originFromServerRequest = (request: HttpServerRequest.HttpServerRequest): string => {
  if (request.url.startsWith("http://") || request.url.startsWith("https://")) {
    return new URL(request.url).origin;
  }

  const protocol = request.headers["x-forwarded-proto"] ?? "http";
  const host = request.headers.host ?? "localhost";

  return `${protocol}://${host}`;
};

export const handleDaemonRequestEffect = (
  request: Request
): Effect.Effect<Response, never, StorageService> => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Effect.succeed(Response.json({ ok: true }));
  }

  if (request.method === "POST" && url.pathname === "/projects") {
    return Effect.gen(function*() {
      const parsed = yield* Effect.promise(async () => {
        try {
          return await request.json() as unknown;
        } catch {
          return null;
        }
      });
      const decoded = yield* Schema.decodeUnknown(RegisterProjectRequestSchema)(parsed).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      );

      if (decoded === null) {
        return Response.json({ error: "Invalid project registration request" }, { status: 400 });
      }

      const storage = yield* StorageService;
      const project = yield* storage.registerProject(decoded.path).pipe(
        Effect.catchAll(() =>
          Effect.succeed(null)
        )
      );

      if (project === null) {
        return Response.json({ error: "Failed to register project" }, { status: 500 });
      }

      return Response.json(makeProjectRegistrationResponse(url.origin, project), { status: 201 });
    });
  }

  return Effect.succeed(new Response("Not found", { status: 404 }));
};

export const makeDaemonHttpApp = () =>
  HttpRouter.empty.pipe(
    HttpRouter.get("/health", HttpServerResponse.json({ ok: true })),
    HttpRouter.post(
      "/projects",
      Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const body = yield* HttpServerRequest.schemaBodyJson(RegisterProjectRequestSchema).pipe(
          Effect.catchAll(() => Effect.succeed(null))
        );

        if (body === null) {
          return yield* HttpServerResponse.json(
            { error: "Invalid project registration request" },
            { status: 400 }
          );
        }

        const storage = yield* StorageService;
        const project = yield* storage.registerProject(body.path);

        return yield* HttpServerResponse.json(
          makeProjectRegistrationResponse(originFromServerRequest(request), project),
          { status: 201 }
        );
      })
    )
  );

export class DaemonHttpService extends Context.Tag("@pocketpatch/daemon/DaemonHttpService")<
  DaemonHttpService,
  {
    readonly handle: (request: Request) => Effect.Effect<Response, never, StorageService>;
  }
>() {}

export const DaemonHttpServiceLive = Layer.succeed(DaemonHttpService, {
  handle: handleDaemonRequestEffect
});

export class DaemonServerBindError extends Error {
  readonly _tag = "DaemonServerBindError";
  override readonly cause: unknown;
  readonly endpoint: DaemonEndpoint;

  constructor(endpoint: DaemonEndpoint, cause: unknown) {
    super(`Failed to bind daemon server at ${endpoint.address}:${endpoint.port}`);
    this.cause = cause;
    this.endpoint = endpoint;
  }
}

export class DaemonServerFactory extends Context.Tag("@pocketpatch/daemon/DaemonServerFactory")<
  DaemonServerFactory,
  {
    readonly bind: (endpoint: DaemonEndpoint) => Effect.Effect<void, DaemonServerBindError, Scope.Scope>;
  }
>() {}

export const startDaemonServer = (endpoint: DaemonEndpoint) =>
  Effect.gen(function*() {
    const factory = yield* DaemonServerFactory;

    yield* factory.bind(endpoint);
  });

export const startDaemonServers = (plan: DaemonStartupPlan) =>
  Effect.forEach(plan.endpoints, startDaemonServer, {
    discard: true
  });

export const DaemonServerFactoryLive = Layer.effect(
  DaemonServerFactory,
  Effect.gen(function*() {
    const storage = yield* StorageService;

    return {
      bind: (endpoint) =>
        HttpServer.serveEffect(makeDaemonHttpApp()).pipe(
          Effect.provideService(StorageService, storage),
          Effect.provide(NodeHttpServer.layer(() => createServer(), {
            host: endpoint.address,
            port: endpoint.port
          })),
          Effect.mapError((cause) => new DaemonServerBindError(endpoint, cause))
        )
    };
  })
);

export const startDaemon = (env: ConfigEnv) =>
  Effect.flatMap(planDaemonStartup(env), startDaemonServers);

export const startDaemonForeground = (env: ConfigEnv) =>
  Effect.scoped(
    startDaemon(env).pipe(
      Effect.zipRight(Effect.never)
    )
  );

export class DaemonControlService extends Context.Tag("@pocketpatch/daemon/DaemonControlService")<
  DaemonControlService,
  {
    readonly plan: typeof planDaemonStartup;
    readonly start: typeof startDaemonForeground;
  }
>() {}

export const DaemonControlServiceLive = Layer.succeed(DaemonControlService, {
  plan: planDaemonStartup,
  start: startDaemonForeground
});
