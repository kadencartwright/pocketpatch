# @pocketpatch/config

Configuration package for XDG path resolution and PocketPatch config parsing.

Implementation is intentionally deferred until tests define the behavior.

## Validation Direction

Use `effect/Schema` for runtime validation instead of Zod.

Rationale:

- It is native to the installed Effect package.
- It gives us decoded TypeScript types from schema definitions.
- It returns typed Effect failures through `Schema.decodeUnknown`.
- It supports synchronous/either decoders for lower-level parser tests.
- It includes built-in error formatters for human-readable CLI output.

Initial config format remains JSON. The config reader should parse JSON to `unknown`, decode it through an Effect Schema, and map parse/validation failures into package-specific config errors.

Reference sources:

- Official docs: https://effect.website/docs/schema/introduction/
- Pinned source: `vendor/effect/packages/effect/src/Schema.ts`
- Pinned parser/error source: `vendor/effect/packages/effect/src/ParseResult.ts`

