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

describe("daemon HTTP handler", () => {
  test("responds to GET /health", async () => {
    const response = await Daemon.handleDaemonRequest(new Request("http://127.0.0.1:3217/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true
    });
  });

  test("returns 404 for unknown routes", async () => {
    const response = await Daemon.handleDaemonRequest(new Request("http://127.0.0.1:3217/nope"));

    expect(response.status).toBe(404);
  });

  test("DaemonHttpService handles requests through an Effect layer", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(new Request("http://127.0.0.1:3217/health"));
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(StorageTest)
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true
    });
  });

  test("DaemonHttpService registers projects", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(new Request("http://127.0.0.1:3217/projects", {
          body: JSON.stringify({ path: "/home/k/code/pocketpatch" }),
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        }));
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(StorageTest)
      )
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      project: {
        createdAt: "2026-05-29T12:00:00.000Z",
        id: 1,
        lastSeenAt: "2026-05-29T12:00:00.000Z",
        path: "/home/k/code/pocketpatch"
      },
      reviewUrl: "http://127.0.0.1:3217/projects/1"
    });
  });

  test("DaemonHttpService rejects malformed project registration requests", async () => {
    const response = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* Daemon.DaemonHttpService;

        return yield* service.handle(new Request("http://127.0.0.1:3217/projects", {
          body: JSON.stringify({ path: "" }),
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        }));
      }).pipe(
        Effect.provide(Daemon.DaemonHttpServiceLive),
        Effect.provide(StorageTest)
      )
    );

    expect(response.status).toBe(400);
  });
});
