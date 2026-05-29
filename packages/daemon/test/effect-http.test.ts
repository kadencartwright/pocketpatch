import { HttpClient, HttpClientResponse, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as Daemon from "../src/index";

describe("daemon Effect HTTP app", () => {
  test("serves GET /health through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        yield* HttpServer.serveEffect(Daemon.makeDaemonHttpApp());

        const response = yield* HttpClient.get("/health");
        const body = yield* HttpClientResponse.schemaBodyJson(Daemon.HealthResponseSchema)(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          ok: true
        });
      }).pipe(Effect.provide(NodeHttpServer.layerTest))
    );

    await Effect.runPromise(program);
  });
});

