---
name: Importing artifact code from the scripts package
description: How a scripts/src test (ESM) can import nxtdrive artifact source (CJS) without breaking runtime or typecheck.
---

The `scripts` package is ESM (`"type":"module"`); the `nxtdrive` artifact is
CommonJS (no `"type":"module"` — Next.js). Importing artifact source into a
scripts test needs all of the following, or it breaks at runtime or typecheck:

- **Runtime named imports fail.** Node's ESM linker uses cjs-module-lexer and
  misses esbuild's CJS export shape, so `import { foo } from ".../mod.ts"`
  throws "does not provide an export named foo". Use a namespace import and
  normalise: `const mod = (ns as {default?: typeof ns}).default ?? ns;` then
  destructure. The exports land directly on the namespace OR under `.default`
  depending on tsx/esbuild version — the `?? ns` covers both.
- **Type-only imports are fine** (`import type {...}`) — erased at runtime,
  resolved only by tsc.
- **tsconfig (scripts/tsconfig.json):** add `baseUrl:"."` + `paths` mapping
  `"@/*": ["../artifacts/nxtdrive/*"]` so tsc resolves the artifact's `@/`
  alias when it follows the import graph; add `allowImportingTsExtensions:true`
  (imports use `.ts` extensions); and **remove `rootDir`** or tsc raises TS6059
  ("not under rootDir") for the out-of-dir artifact files. scripts only
  typechecks with `--noEmit`, so dropping `rootDir` is safe.

**Why:** test the route scoring engine (route.ts/suggestions.ts) from the
existing scripts test harness without a refactor.
**Caveat:** the pnpm-workspace skill says artifacts and scripts should not
import each other (shared code belongs in a `lib/*`). This cross-import is a
deliberate, test-only exception; prefer extracting a lib if more cross-use grows.
