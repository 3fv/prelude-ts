# prelude-ts: imports never cross the `src/` boundary

**Nothing outside `src/` imports from `src/` by path, and nothing in `src/` imports from outside
it.** Every other root (`tests/`, `benchmarks/`, `scripts/`, the generated API-doc tests under
`generated/`, and the source text that test helpers emit) consumes the library by its package
name, `@3fv/prelude-ts`.

## How it works in this repo

- **Package self-reference.** `package.json` `exports` maps `"."` to `lib/{esm,cjs}/index.js` and
  `"./*"` to `lib/{esm,cjs}/*.js`. Inside the repo, Node and TypeScript resolve the package's
  own name through that map.
  - Import from the root (`import { Vector, Future } from "@3fv/prelude-ts"`) whenever
    `src/index.ts` re-exports the symbol.
  - Use a subpath for modules the index leaves out on purpose, such as
    `import { Seq } from "@3fv/prelude-ts/Seq"` and `"@3fv/prelude-ts/Collection"`.
- **Consumer configs resolve by name.** `tsconfig.test.json`, `tsconfig.benchmarks.json` and
  `tsconfig.docgen.json` use `"module"`/`"moduleResolution": "node16"` and include only their
  own root, never `src`.
- **Tests run against the build.** `pnpm test` runs `pnpm build` first, then compiles the tests
  to `lib/test/` and runs mocha. A broken `exports` map or a missing entry point fails the
  tests.
- **Generated code follows the same rule.** `tests/Comments.ts` writes API-doc tests to
  `generated/apidoc-tests/` with package-name imports. `tests/TestHelpers.ts` writes its
  compile-failure probes the same way.
- **Enforced by `tests/ImportBoundaries.ts`.** It walks the tree and fails on any relative
  import that crosses a `src` boundary in either direction.

## When something is not exported

Add the export in `src/index.ts` or rely on the `"./*"` subpath export. Never add `src` to a
consumer tsconfig's `include`, a `paths` alias onto `src`, or a `../src/...` specifier.
