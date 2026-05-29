import type { ConfigEnv } from "@pocketpatch/config";
import { ConfigService } from "@pocketpatch/config";
import { NetworkService } from "@pocketpatch/network";
import { Context, Effect, Layer } from "effect";

export type DaemonEndpoint = {
  readonly address: string;
  readonly port: number;
};

export type DaemonStartupPlan = {
  readonly endpoints: ReadonlyArray<DaemonEndpoint>;
};

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

export class DaemonHttpService extends Context.Tag("@pocketpatch/daemon/DaemonHttpService")<
  DaemonHttpService,
  {
    readonly handle: (request: Request) => Effect.Effect<Response>;
  }
>() {}

export const DaemonHttpServiceLive = Layer.succeed(DaemonHttpService, {
  handle: (request) => Effect.promise(() => handleDaemonRequest(request))
});
