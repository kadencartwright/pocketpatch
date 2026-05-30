import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { HttpRouter, HttpServer, HttpServerResponse } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";
import { Schema } from "effect";
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

export const makeDaemonHttpApp = () =>
  HttpRouter.empty.pipe(
    HttpRouter.get("/health", HttpServerResponse.json({ ok: true }))
  );

export class DaemonHttpService extends Context.Tag("@pocketpatch/daemon/DaemonHttpService")<
  DaemonHttpService,
  {
    readonly handle: (request: Request) => Effect.Effect<Response>;
  }
>() {}

export const DaemonHttpServiceLive = Layer.succeed(DaemonHttpService, {
  handle: (request) => Effect.promise(() => handleDaemonRequest(request))
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

export const DaemonServerFactoryLive = Layer.succeed(DaemonServerFactory, {
  bind: (endpoint) =>
    HttpServer.serveEffect(makeDaemonHttpApp()).pipe(
      Effect.provide(NodeHttpServer.layer(() => createServer(), {
        host: endpoint.address,
        port: endpoint.port
      })),
      Effect.mapError((cause) => new DaemonServerBindError(endpoint, cause))
    )
});

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
