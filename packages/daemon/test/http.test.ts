import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as Daemon from "../src/index";

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
      }).pipe(Effect.provide(Daemon.DaemonHttpServiceLive))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true
    });
  });
});
