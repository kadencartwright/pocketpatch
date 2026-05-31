import { describe, expect, test } from "bun:test";
import * as Network from "../src/index";

describe("local address listing", () => {
  test("normalizes OS network interfaces into address records", () => {
    expect(
      Network.listLocalAddressesFromInterfaces({
        lo: [
          {
            address: "127.0.0.1",
            family: "IPv4",
            internal: true,
          },
          {
            address: "::1",
            family: "IPv6",
            internal: true,
          },
        ],
        tailscale0: [
          {
            address: "100.64.12.34",
            family: "IPv4",
            internal: false,
          },
        ],
      }),
    ).toEqual([
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
    ]);
  });
});
