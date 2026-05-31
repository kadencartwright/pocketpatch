import type { PocketPatchConfig } from "@pocketpatch/config";
import { Context, Effect, Layer, Schema } from "effect";
import { networkInterfaces } from "node:os";

export type AddressFamily = "IPv4" | "IPv6";

export const LocalAddressSchema = Schema.Struct({
  address: Schema.String,
  family: Schema.Literal("IPv4", "IPv6"),
  interfaceName: Schema.String,
  internal: Schema.Boolean
});

export type LocalAddress = typeof LocalAddressSchema.Type;

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

export class BindAddressNotFoundError extends Schema.TaggedError<BindAddressNotFoundError>()(
  "BindAddressNotFoundError",
  {
    address: Schema.String,
    availableAddresses: Schema.Array(LocalAddressSchema)
  }
) {
  override get message(): string {
    return `Configured bind address ${this.address} was not found on this machine`;
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

  throw new BindAddressNotFoundError({
    address: bindAddress,
    availableAddresses: addresses
  });
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
        : new BindAddressNotFoundError({
          address: String(bindAddress),
          availableAddresses: addresses
        }),
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
        : new BindAddressNotFoundError({
          address: String(config.network.bindAddress),
          availableAddresses: addresses
        }),
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
