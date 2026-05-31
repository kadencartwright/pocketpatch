# Effect Testing Principles

This note summarizes useful testing patterns from `opencode` and how they map
to PocketPatch. The examples link to `opencode` at commit
`1afa9e32c9ebde43fc94782c883b422a3628daff` so the references remain stable.

## 1. Wrap `bun:test` With An Effect-Aware Harness

Effect tests should pass an `Effect` directly to the test runner. The harness
should own `Effect.runPromise`, `Effect.scoped`, common test layers, and failure
printing. This keeps tests focused on behavior instead of plumbing.

PocketPatch direction:

- Add a small helper such as `test/lib/effect.ts`.
- Export `it.effect` for deterministic tests and `it.live` for tests that use
  real time or live IO.
- Include `TestClock` and `TestConsole` in the default test environment.
- Log `Cause.prettyErrors` before returning a failed exit.

Examples:

- [`opencode` package harness: scoped runner and pretty failure logging](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/lib/effect.ts#L37-L46)
- [`opencode` package harness: `it.effect`, `it.live`, and `it.instance`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/lib/effect.ts#L66-L127)
- [`core` package harness: smaller package-local version](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/core/test/lib/effect.ts#L11-L53)

## 2. Make Layers The Test Boundary

Production code should depend on services, not process globals or concrete
implementations. Tests can then replace a service with `Layer.succeed` or compose
just enough live layers for the behavior under test.

PocketPatch already has good candidates: `ConfigService`, `NetworkService`,
`StorageService`, `GitService`, `DaemonServerFactory`, and Effect HTTP server
layers. Prefer testing behavior by providing those services instead of reaching
through to lower-level implementation details.

Examples:

- [Composing a full HTTP API test layer with `Layer.mergeAll`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/server/httpapi-session.test.ts#L45-L73)
- [Providing fake request and WebSocket executors for a protocol test](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/provider/openai-responses.test.ts#L77-L129)
- [Providing a parsed config service directly](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/config-service.test.ts#L46-L64)

## 3. Prefer Scoped Fixtures Over Manual Cleanup

Fixtures that create temp directories, git repos, database state, or server
resources should be scoped Effects. Cleanup then happens when the test scope
closes, not in ad hoc `afterEach` lists.

PocketPatch direction:

- Create `tmpConfigEnvScoped` for config and CLI tests.
- Create a scoped SQLite memory helper for storage tests.
- Keep any daemon/server bindings inside `Effect.scoped`.

Examples:

- [Scoped temp directory with finalizer cleanup](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/fixture/fixture.ts#L116-L160)
- [Scoped instance fixture that provides test services](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/fixture/fixture.ts#L196-L206)
- [`it.instance` wrapping tests with a temporary instance](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/lib/effect.ts#L85-L127)

## 4. Keep Failure Assertions Inside Effect

Typed failures are easier to read when the assertion stays in the generator.
Use `Effect.flip` when the test expects a domain failure, or `Effect.exit` when
the exact `Exit` matters. Avoid repeating `runPromiseExit -> Cause -> Either`
unpacking in every test.

PocketPatch direction:

- Add helpers like `expectFailure(effect, ErrorClass)` or
  `expectTaggedFailure(effect, tag)`.
- In simple tests, prefer `const error = yield* effect.pipe(Effect.flip)`.

Examples:

- [Using `Effect.flip` to assert a WebSocket failure](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/provider/openai-responses.test.ts#L132-L141)
- [Using `Effect.flip` for HTTP executor error assertions](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/executor.test.ts#L300-L315)
- [Using `Effect.exit` when testing runner state after failure](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/runner.test.ts#L26-L35)

## 5. Use Effect Primitives For Concurrency And Time

Do not test asynchronous behavior with real sleeps unless the live boundary is
the point of the test. Use `Ref`, `Deferred`, `Fiber`, `Effect.yieldNow`, and
`TestClock` so tests are deterministic and fast.

PocketPatch direction:

- Use `Deferred` to coordinate daemon start/stop and server factory tests.
- Use `TestClock.adjust` for retry, debounce, timeout, and polling behavior.
- Use `Ref` to count calls made through fake services.

Examples:

- [Testing concurrent callers with `Ref` and `Effect.all`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/runner.test.ts#L37-L57)
- [Testing cancellation with `Deferred` and `Fiber`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/runner.test.ts#L118-L141)
- [Testing retry timing with `TestClock.adjust`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/executor.test.ts#L318-L345)

## 6. Build Reusable Protocol Fixtures

HTTP, WebSocket, and server tests become much shorter when common protocol
fixtures are layers. A test should describe the request/response behavior it
cares about, not rebuild an HTTP client fake each time.

PocketPatch direction:

- Add helpers for Effect HTTP route tests: `getJson`, `postJson`,
  `expectStatus`, and a default daemon API layer.
- Add package-level `StorageTest` and `GitTest` builders instead of repeating
  large `Layer.succeed` objects.
- For future networked integrations, prefer fixed, dynamic, and scripted
  response layers over live calls.

Examples:

- [HTTP client fake backed by a handler function](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/lib/http.ts#L19-L42)
- [Fixed, dynamic, truncated, and scripted response layers](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/lib/http.ts#L44-L98)
- [Using `dynamicResponse` to assert request URL and headers](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/provider/openai-responses.test.ts#L144-L191)

## 7. Use Effect Config As An Injectable Input

Environment and config values should be supplied through `ConfigProvider` or a
config service layer. Tests should avoid mutating process-wide environment
state when a provider layer can express the scenario.

PocketPatch direction:

- Keep `ConfigEnv` explicit at CLI boundaries.
- For lower-level Effect services, prefer `ConfigProvider.layer` or a
  `ConfigService` test layer.
- Use direct config layers for already-parsed values and provider layers for
  parsing/default behavior.

Examples:

- [Parsing values from an active `ConfigProvider`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/config-service.test.ts#L12-L33)
- [Testing config defaults from Effect Config](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/effect/config-service.test.ts#L36-L44)
- [Providing environment-backed API key config in a protocol test](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/llm/test/provider/openai-responses.test.ts#L194-L212)

## 8. Add Service Accessors For Concise Test Code

Tests are more coherent when service calls read like domain operations. A typed
`Service.use.method(...)` accessor can remove repeated `const service = yield*
Service` blocks without hiding the service boundary.

PocketPatch direction:

- Consider a small `serviceUse` helper for services with several methods.
- Use it for high-traffic services first: storage, daemon control, git, and
  config.
- Keep the original `Context.Tag` exported so tests can still provide layers
  explicitly.

Examples:

- [`serviceUse` implementation](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/core/src/effect/service-use.ts#L1-L43)
- [Tests using `Session.use.create` as a domain-level helper](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/server/httpapi-session.test.ts#L79-L103)
- [Tests using `Config.use.get` inside instance fixtures](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/config/config.test.ts#L288-L317)

## 9. Keep Pure Logic Outside Effect

Use Effect where there is a real dependency, failure channel, resource, or
concurrency concern. Keep parsing, view-model shaping, URL construction, and
small transformations pure. Pure functions should have plain `bun:test` tests.

PocketPatch already follows this in several places: network address
normalization, bind-address selection, web diff URL building, syntax detection,
and route/view-model helpers. Preserve that split as the Effect test harness is
introduced.

Examples:

- [Pure redaction tests in `http-recorder`](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/http-recorder/test/record-replay.test.ts#L57-L116)
- [Pure secret detection fixture test](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/http-recorder/test/record-replay.test.ts#L118-L154)
- [Small path/route helper used by HTTP API tests](https://github.com/sst/opencode/blob/1afa9e32c9ebde43fc94782c883b422a3628daff/packages/opencode/test/server/httpapi-session.test.ts#L75-L81)

## Suggested First Migration

1. Add `test/lib/effect.ts` with `it.effect`, `it.live`, `testEffect`, scoped
   execution, `TestClock`, `TestConsole`, and pretty cause logging.
2. Add `expectFailure` or `expectTaggedFailure` to remove repeated
   `Exit/Cause/Either` assertions.
3. Migrate `packages/storage/test/projects.test.ts`, because it has repeated
   storage layer setup and typed failure assertions.
4. Migrate `packages/network/test/layers.test.ts`, because it is a small,
   low-risk example of service layer testing.
5. Migrate `packages/daemon/test/effect-http.test.ts`, adding daemon HTTP
   request helpers while keeping the API behavior coverage.
