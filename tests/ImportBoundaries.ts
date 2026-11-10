import * as assert from "assert"
import * as fs from "fs"
import * as path from "path"

/**
 * Import statements never cross a `src`/`source` folder boundary: code outside
 * `src/` consumes the library through its package name (`@3fv/prelude-ts`,
 * resolved by package.json "exports"), and code inside `src/` never imports
 * from outside it.
 */

const SOURCE_DIR_NAMES = new Set(["src", "source"])
const SKIPPED_DIRS = new Set([
  "node_modules",
  "lib",
  "dist",
  "apidoc",
  ".git",
  ".idea",
  ".claude",
  ".omc",
  ".remember"
])
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"])
const SPECIFIER_PATTERNS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
]

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : listSourceFiles(full)
    }
    return SCANNED_EXTENSIONS.has(path.extname(entry.name)) ? [full] : []
  })
}

/** The nearest enclosing `src`/`source` folder of a path, or null. */
function sourceRootOf(file: string): string | null {
  const parts = path.resolve(file).split(path.sep)
  for (let i = parts.length - 2; i >= 0; i--) {
    if (SOURCE_DIR_NAMES.has(parts[i])) {
      return parts.slice(0, i + 1).join(path.sep)
    }
  }
  return null
}

/** Relative specifiers in `code` that cross a source boundary when imported from `file`. */
export function crossingImports(file: string, code: string): string[] {
  const fromRoot = sourceRootOf(file)
  const crossing: string[] = []
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1]
      if (!specifier.startsWith(".")) {
        continue
      }
      const target = path.resolve(path.dirname(file), specifier)
      if (sourceRootOf(target) !== fromRoot) {
        crossing.push(specifier)
      }
    }
  }
  return crossing
}

// Sample statements are assembled at run time so this file's own text holds no
// crossing specifier for the repository scan below to report.
const importOf = (specifier: string) =>
  "import { X } from " + JSON.stringify(specifier)
const requireOf = (specifier: string) =>
  "const x = require(" + JSON.stringify(specifier) + ")"

describe("import boundaries", () => {
  it("detects imports crossing a src folder in both directions", () => {
    const intoSrc = ["..", "src", "Future"].join("/")
    const outOfSrc = ["..", "tests", "TestHelpers"].join("/")
    assert.deepEqual(crossingImports("tests/X.ts", importOf(intoSrc)), [
      intoSrc
    ])
    assert.deepEqual(crossingImports("src/X.ts", requireOf(outOfSrc)), [
      outOfSrc
    ])
    assert.deepEqual(crossingImports("src/X.ts", importOf("./Vector.js")), [])
    assert.deepEqual(
      crossingImports("tests/X.ts", importOf("@3fv/prelude-ts")),
      []
    )
  })

  it("no file in the repository imports across a src folder", () => {
    const files = listSourceFiles(process.cwd())
    assert.ok(files.length > 0, "found no source files to scan")
    const violations = files.flatMap((file) =>
      crossingImports(file, fs.readFileSync(file, "utf8")).map(
        (specifier) => `${path.relative(process.cwd(), file)}: ${specifier}`
      )
    )
    assert.deepEqual(violations, [])
  })
})
