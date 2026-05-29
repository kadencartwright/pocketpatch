import { describe, expect, test } from "bun:test";
import * as Config from "../src/index";

describe("PocketPatch config", () => {
  test("exposes the default v1 config", () => {
    expect(Config.defaultConfig).toEqual({
      version: 1,
      network: {
        bindAddress: null,
        port: 3217
      }
    });
  });

  test("decodes a valid v1 config from unknown input", async () => {
    await expect(Config.decodeConfig({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217
      }
    })).resolves.toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217
      }
    });
  });

  test("rejects ports outside the TCP port range", async () => {
    await expect(Config.decodeConfig({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 0
      }
    })).rejects.toThrow();

    await expect(Config.decodeConfig({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 65536
      }
    })).rejects.toThrow();
  });

  test("rejects a non-IP bind address", async () => {
    await expect(Config.decodeConfig({
      version: 1,
      network: {
        bindAddress: "tailscale0",
        port: 3217
      }
    })).rejects.toThrow();
  });

  test("sets a bind address without mutating the original config", async () => {
    const updated = await Config.setBindAddress(Config.defaultConfig, "100.64.12.34");

    expect(Config.defaultConfig.network.bindAddress).toBeNull();
    expect(updated).toEqual({
      version: 1,
      network: {
        bindAddress: "100.64.12.34",
        port: 3217
      }
    });
  });

  test("rejects an invalid bind address update", async () => {
    await expect(Config.setBindAddress(Config.defaultConfig, "tailscale0")).rejects.toThrow();
  });
});
