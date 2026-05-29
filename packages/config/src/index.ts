import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Cause, Context, Effect, Exit, Layer, ParseResult, Schema } from "effect";
import { isIP } from "node:net";
import { dirname, join } from "node:path";

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

export type ConfigEnv = {
  readonly HOME?: string | undefined;
  readonly XDG_CACHE_HOME?: string | undefined;
  readonly XDG_CONFIG_HOME?: string | undefined;
  readonly XDG_RUNTIME_DIR?: string | undefined;
  readonly XDG_STATE_HOME?: string | undefined;
};

export type ConfigPaths = {
  readonly cacheDir: string;
  readonly configFile: string;
  readonly runtimeDir: string | null;
  readonly stateDb: string;
};

export class ConfigPathError extends Error {
  readonly _tag = "ConfigPathError";
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing ${variable}; set XDG paths or HOME`);
    this.variable = variable;
  }
}

export class ConfigJsonParseError extends Error {
  readonly _tag = "ConfigJsonParseError";
  override readonly cause: unknown;
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Invalid JSON config at ${path}`);
    this.cause = cause;
    this.path = path;
  }
}

export class ConfigValidationError extends Error {
  readonly _tag = "ConfigValidationError";
  override readonly cause: unknown;
  readonly path: string;

  constructor(path: string, cause: unknown, message: string) {
    super(message);
    this.cause = cause;
    this.path = path;
  }
}

const runPromiseDomain = async <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
};

const resolveHome = (env: ConfigEnv): Effect.Effect<string, ConfigPathError> =>
  env.HOME === undefined || env.HOME === ""
    ? Effect.fail(new ConfigPathError("HOME"))
    : Effect.succeed(env.HOME);

const resolveWithHome = (
  env: ConfigEnv,
  xdgValue: string | undefined,
  fallback: (home: string) => string
): Effect.Effect<string, ConfigPathError> =>
  xdgValue === undefined || xdgValue === ""
    ? Effect.map(resolveHome(env), fallback)
    : Effect.succeed(xdgValue);

const resolveConfigPathsEffect = (env: ConfigEnv): Effect.Effect<ConfigPaths, ConfigPathError> =>
  Effect.gen(function*() {
    const cacheHome = yield* resolveWithHome(env, env.XDG_CACHE_HOME, (home) => join(home, ".cache"));
    const configHome = yield* resolveWithHome(env, env.XDG_CONFIG_HOME, (home) => join(home, ".config"));
    const stateHome = yield* resolveWithHome(env, env.XDG_STATE_HOME, (home) => join(home, ".local", "state"));

    return {
      cacheDir: join(cacheHome, "pocketpatch"),
      configFile: join(configHome, "pocketpatch", "config.json"),
      runtimeDir: env.XDG_RUNTIME_DIR === undefined ? null : join(env.XDG_RUNTIME_DIR, "pocketpatch"),
      stateDb: join(stateHome, "pocketpatch", "pocketpatch.db")
    };
  });

export const resolveConfigPaths = (env: ConfigEnv): Promise<ConfigPaths> =>
  runPromiseDomain(resolveConfigPathsEffect(env));

export const readConfigEffect = (env: ConfigEnv) =>
  Effect.gen(function*() {
    const paths = yield* resolveConfigPathsEffect(env);
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(paths.configFile);

    if (!exists) {
      return defaultConfig;
    }

    const contents = yield* fs.readFileString(paths.configFile);
    let parsed: unknown;

    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      return yield* Effect.fail(new ConfigJsonParseError(paths.configFile, error));
    }

    const decoded = yield* Effect.exit(decodeConfigEffect(parsed));
    if (Exit.isSuccess(decoded)) {
      return decoded.value;
    }

    const cause = Cause.squash(decoded.cause);
    const message = cause instanceof ParseResult.ParseError
      ? ParseResult.TreeFormatter.formatErrorSync(cause)
      : String(cause);

    return yield* Effect.fail(new ConfigValidationError(paths.configFile, cause, message));
  });

export const readConfig = (env: ConfigEnv): Promise<PocketPatchConfig> =>
  runPromiseDomain(readConfigEffect(env).pipe(Effect.provide(NodeFileSystem.layer)));

export const writeConfigEffect = (env: ConfigEnv, config: PocketPatchConfig) =>
  Effect.gen(function*() {
    const paths = yield* resolveConfigPathsEffect(env);
    const fs = yield* FileSystem.FileSystem;

    yield* fs.makeDirectory(dirname(paths.configFile), { recursive: true });
    yield* fs.writeFileString(paths.configFile, `${JSON.stringify(config, null, 2)}\n`);
  });

export const writeConfig = (env: ConfigEnv, config: PocketPatchConfig): Promise<void> =>
  runPromiseDomain(writeConfigEffect(env, config).pipe(Effect.provide(NodeFileSystem.layer)));

export const setBindAddressEffect = (
  config: PocketPatchConfig,
  bindAddress: string | null
): Effect.Effect<PocketPatchConfig, ParseResult.ParseError> =>
  decodeConfigEffect({
    ...config,
    network: {
      ...config.network,
      bindAddress
    }
  });

export const setBindAddress = (
  config: PocketPatchConfig,
  bindAddress: string | null
): Promise<PocketPatchConfig> =>
  Effect.runPromise(setBindAddressEffect(config, bindAddress));

export class ConfigService extends Context.Tag("@pocketpatch/config/ConfigService")<
  ConfigService,
  {
    readonly load: (env: ConfigEnv) => ReturnType<typeof readConfigEffect>;
    readonly paths: (env: ConfigEnv) => Effect.Effect<ConfigPaths, ConfigPathError>;
    readonly save: (env: ConfigEnv, config: PocketPatchConfig) => ReturnType<typeof writeConfigEffect>;
    readonly setBindAddress: typeof setBindAddressEffect;
  }
>() {}

export const ConfigServiceLive = Layer.succeed(ConfigService, {
  load: readConfigEffect,
  paths: resolveConfigPathsEffect,
  save: writeConfigEffect,
  setBindAddress: setBindAddressEffect
});
