import { describe, expect, test } from "vitest";
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

describe("bind address validation", () => {
  test("accepts null as an unconfigured remote bind address", () => {
    expect(Network.validateBindAddress(null, addresses)).toBeNull();
  });

  test("accepts a configured address that exists locally", () => {
    expect(Network.validateBindAddress("100.64.12.34", addresses)).toEqual({
      address: "100.64.12.34",
      family: "IPv4",
      interfaceName: "tailscale0",
      internal: false,
    });
  });

  test("rejects a configured address that is not local", () => {
    expect(() =>
      Network.validateBindAddress("100.64.99.99", addresses),
    ).toThrow(Network.BindAddressNotFoundError);
  });

  test("bind address errors include requested and available addresses", () => {
    try {
      Network.validateBindAddress("100.64.99.99", addresses);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Network.BindAddressNotFoundError);
      expect(error).toMatchObject({
        _tag: "BindAddressNotFoundError",
        address: "100.64.99.99",
        availableAddresses: addresses,
      });
    }
  });
});
