import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { NodeHttpClient } from "@effect/platform-node";
import { ConfigService } from "@pocketpatch/config";
import { Effect, Layer } from "effect";
import { describe, expect, test } from "vitest";
import { DaemonClientService, DaemonClientServiceLive } from "../src/index";

const withProjectServer = async <A>(
  f: (port: number, requests: Array<unknown>) => Promise<A>,
): Promise<A> => {
  const requests: Array<unknown> = [];
  const server = createServer(async (request, response) => {
    const chunks: Array<Buffer> = [];

    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }

    requests.push({
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
      method: request.method,
      url: request.url,
    });
    response.writeHead(201, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        project: {
          createdAt: "2026-05-30T12:00:00.000Z",
          id: 42,
          lastSeenAt: "2026-05-30T12:00:00.000Z",
          path: "/home/k/code/pocketpatch",
        },
        reviewUrl: "http://127.0.0.1:3217/projects/42",
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    return await f((server.address() as AddressInfo).port, requests);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
};

describe("DaemonClientService", () => {
  test("registers projects over HTTP using the configured port", async () => {
    await withProjectServer(async (port, requests) => {
      const ConfigTest = Layer.succeed(ConfigService, {
        load: () =>
          Effect.succeed({
            version: 1 as const,
            network: {
              bindAddress: null,
              port,
            },
          }),
        paths: () => Effect.die("unused"),
        save: () => Effect.die("unused"),
        setBindAddress: () => Effect.die("unused"),
      });
      const response = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* DaemonClientService;

          return yield* client.registerProject(
            { HOME: "/home/k" },
            "/home/k/code/pocketpatch",
          );
        }).pipe(
          Effect.provide(DaemonClientServiceLive),
          Effect.provide(ConfigTest),
          Effect.provide(NodeHttpClient.layer),
        ),
      );

      expect(response.reviewUrl).toBe("http://127.0.0.1:3217/projects/42");
      expect(requests).toEqual([
        {
          body: {
            path: "/home/k/code/pocketpatch",
          },
          method: "POST",
          url: "/api/projects",
        },
      ]);
    });
  });
});
