import { HttpClient, HttpClientRequest, HttpClientResponse, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { StorageService } from "@pocketpatch/storage";
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import * as Daemon from "../src/index";

const StorageTest = Layer.succeed(StorageService, {
  registerProject: (path) =>
    Effect.succeed({
      createdAt: "2026-05-29T12:00:00.000Z",
      id: 1,
      lastSeenAt: "2026-05-29T12:00:00.000Z",
      path
    })
});

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

  test("serves POST /projects through Effect Platform", async () => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        yield* HttpServer.serveEffect(Daemon.makeDaemonHttpApp());

        const response = yield* HttpClientRequest.post("/projects").pipe(
          HttpClientRequest.bodyJson({ path: "/home/k/code/pocketpatch" }),
          Effect.flatMap(HttpClient.execute)
        );
        const body = yield* HttpClientResponse.schemaBodyJson(Daemon.ProjectRegistrationResponseSchema)(response);

        expect(response.status).toBe(201);
        expect(body.project).toEqual({
          createdAt: "2026-05-29T12:00:00.000Z",
          id: 1,
          lastSeenAt: "2026-05-29T12:00:00.000Z",
          path: "/home/k/code/pocketpatch"
        });
        expect(new URL(body.reviewUrl).pathname).toBe("/projects/1");
        expect(body.reviewUrl).toStartWith("http://127.0.0.1:");
      }).pipe(
        Effect.provide(StorageTest),
        Effect.provide(NodeHttpServer.layerTest)
      )
    );

    await Effect.runPromise(program);
  });
});
