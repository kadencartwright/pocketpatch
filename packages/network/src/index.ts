import type { PocketPatchConfig } from "@pocketpatch/config";
import { Context, Effect, Layer } from "effect";
import { networkInterfaces } from "node:os";

export type AddressFamily = "IPv4" | "IPv6";

export type LocalAddress = {
  readonly address: string;
  readonly family: AddressFamily;
  readonly interfaceName: string;
  readonly internal: boolean;
};

type NetworkInterfaceInfo = {
  readonly address: string;
  readonly family: string;
  readonly internal: boolean;
};

export type NetworkInterfaces = Record<string, ReadonlyArray<NetworkInterfaceInfo> | undefined>;

const isAddressFamily = (family: string): family is AddressFamily =>
  family === "IPv4" || family === "IPv6";

export const listLocalAddressesFromInterfaces = (interfaces: NetworkInterfaces): Array<LocalAddress> =>
  Object.entries(interfaces).flatMap(([interfaceName, addresses]) =>
    (addresses ?? []).flatMap((address) =>
      isAddressFamily(address.family)
        ? [{
          address: address.address,
          family: address.family,
          interfaceName,
          internal: address.internal
        }]
        : []
    )
  );

export const listLocalAddresses = (): Array<LocalAddress> =>
  listLocalAddressesFromInterfaces(networkInterfaces());

export class BindAddressNotFoundError extends Error {
  readonly _tag = "BindAddressNotFoundError";
  readonly address: string;
  readonly availableAddresses: ReadonlyArray<LocalAddress>;

  constructor(address: string, availableAddresses: ReadonlyArray<LocalAddress>) {
    super(`Configured bind address ${address} was not found on this machine`);
    this.address = address;
    this.availableAddresses = availableAddresses;
  }
}

export const validateBindAddress = (
  bindAddress: string | null,
  addresses: ReadonlyArray<LocalAddress>
): LocalAddress | null => {
  if (bindAddress === null) {
    return null;
  }

  const match = addresses.find((address) => address.address === bindAddress);
  if (match !== undefined) {
    return match;
  }

  throw new BindAddressNotFoundError(bindAddress, addresses);
};

const isLocalhostAddress = (address: LocalAddress): boolean =>
  address.internal && (address.address === "127.0.0.1" || address.address === "::1");

export const computeListenAddresses = (
  bindAddress: string | null,
  addresses: ReadonlyArray<LocalAddress>
): Array<string> => {
  const listenAddresses = addresses
    .filter(isLocalhostAddress)
    .map((address) => address.address);
  const validatedBindAddress = validateBindAddress(bindAddress, addresses);

  if (validatedBindAddress !== null && !listenAddresses.includes(validatedBindAddress.address)) {
    listenAddresses.push(validatedBindAddress.address);
  }

  return listenAddresses;
};

export const computeListenAddressesForConfig = (
  config: PocketPatchConfig,
  addresses: ReadonlyArray<LocalAddress>
): Array<string> =>
  computeListenAddresses(config.network.bindAddress, addresses);

export const validateBindAddressEffect = (
  bindAddress: string | null,
  addresses: ReadonlyArray<LocalAddress>
): Effect.Effect<LocalAddress | null, BindAddressNotFoundError> =>
  Effect.try({
    catch: (error) =>
      error instanceof BindAddressNotFoundError
        ? error
        : new BindAddressNotFoundError(String(bindAddress), addresses),
    try: () => validateBindAddress(bindAddress, addresses)
  });

export const computeListenAddressesForConfigEffect = (
  config: PocketPatchConfig,
  addresses: ReadonlyArray<LocalAddress>
): Effect.Effect<Array<string>, BindAddressNotFoundError> =>
  Effect.try({
    catch: (error) =>
      error instanceof BindAddressNotFoundError
        ? error
        : new BindAddressNotFoundError(String(config.network.bindAddress), addresses),
    try: () => computeListenAddressesForConfig(config, addresses)
  });

export class AddressSource extends Context.Tag("@pocketpatch/network/AddressSource")<
  AddressSource,
  {
    readonly list: () => ReadonlyArray<LocalAddress>;
  }
>() {}

export const AddressSourceLive = Layer.succeed(AddressSource, {
  list: listLocalAddresses
});

export class NetworkService extends Context.Tag("@pocketpatch/network/NetworkService")<
  NetworkService,
  {
    readonly computeListenAddresses: (
      config: PocketPatchConfig
    ) => Effect.Effect<Array<string>, BindAddressNotFoundError>;
    readonly listLocalAddresses: Effect.Effect<ReadonlyArray<LocalAddress>>;
    readonly validateBindAddress: (
      bindAddress: string | null
    ) => Effect.Effect<LocalAddress | null, BindAddressNotFoundError>;
  }
>() {}

export const NetworkServiceLive = Layer.effect(
  NetworkService,
  Effect.gen(function*() {
    const source = yield* AddressSource;
    const list = Effect.sync(source.list);

    return {
      computeListenAddresses: (config) =>
        Effect.flatMap(list, (addresses) => computeListenAddressesForConfigEffect(config, addresses)),
      listLocalAddresses: list,
      validateBindAddress: (bindAddress) =>
        Effect.flatMap(list, (addresses) => validateBindAddressEffect(bindAddress, addresses))
    };
  })
);

export const NetworkServiceNodeLive = NetworkServiceLive.pipe(
  Layer.provide(AddressSourceLive)
);
