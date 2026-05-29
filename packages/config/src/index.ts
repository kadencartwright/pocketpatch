import { Effect, Schema } from "effect";
import { isIP } from "node:net";

const IpAddressSchema = Schema.String.pipe(
  Schema.filter((value) => isIP(value) !== 0, {
    identifier: "IpAddress",
    message: () => "Expected a valid IP address"
  })
);

export const ConfigSchema = Schema.Struct({
  version: Schema.Literal(1),
  network: Schema.Struct({
    bindAddress: Schema.NullOr(IpAddressSchema),
    port: Schema.Number.pipe(Schema.int(), Schema.between(1, 65535))
  })
});

export type PocketPatchConfig = typeof ConfigSchema.Type;

export const defaultConfig: PocketPatchConfig = {
  version: 1,
  network: {
    bindAddress: null,
    port: 3217
  }
};

const decodeConfigEffect = Schema.decodeUnknown(ConfigSchema);

export const decodeConfig = (input: unknown): Promise<PocketPatchConfig> =>
  Effect.runPromise(decodeConfigEffect(input));
