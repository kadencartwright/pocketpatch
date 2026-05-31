import { describe, expect, test } from "bun:test";
import * as Network from "../src/index";

const addresses: Array<Network.LocalAddress> = [
  {
    address: "127.0.0.1",
    family: "IPv4",
    interfaceName: "lo",
    internal: true,
  },
  {
    address: "::1",
    family: "IPv6",
    interfaceName: "lo",
    internal: true,
  },
  {
    address: "100.64.12.34",
    family: "IPv4",
    interfaceName: "tailscale0",
    internal: false,
  },
];

describe("listen address computation", () => {
  test("always includes localhost addresses", () => {
    expect(Network.computeListenAddresses(null, addresses)).toEqual([
      "127.0.0.1",
      "::1",
    ]);
  });

  test("includes the configured bind address when present", () => {
    expect(Network.computeListenAddresses("100.64.12.34", addresses)).toEqual([
      "127.0.0.1",
      "::1",
      "100.64.12.34",
    ]);
  });

  test("does not duplicate localhost when configured as bind address", () => {
    expect(Network.computeListenAddresses("127.0.0.1", addresses)).toEqual([
      "127.0.0.1",
      "::1",
    ]);
  });

  test("computes listen addresses from PocketPatch config", () => {
    expect(
      Network.computeListenAddressesForConfig(
        {
          version: 1,
          network: {
            bindAddress: "100.64.12.34",
            port: 3217,
          },
        },
        addresses,
      ),
    ).toEqual(["127.0.0.1", "::1", "100.64.12.34"]);
  });
});
