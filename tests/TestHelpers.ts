import * as ts from "typescript"
import * as fs from "fs"
import * as path from "path"
import * as assert from "assert"

// The probe lives inside the package (under the git-ignored lib/test) so that
// "@3fv/prelude-ts" resolves to the built package through package.json "exports".
const TMP_FILENAME = path.join("lib", "test", "assert-fail-compile.ts")

function diagnosticMsgToString(
  diagMsg: string | ts.DiagnosticMessageChain
): string {
  if (typeof diagMsg === "string") {
    return diagMsg
  }
  let curMsg: ts.DiagnosticMessageChain | undefined = diagMsg
  while (curMsg) {
    if (typeof curMsg.messageText === "string") {
      return curMsg.messageText
    }
    curMsg = curMsg.next as any
  }
  return "found no error"
}

function diagnosticMsgContains(
  diagMsg: string | ts.DiagnosticMessageChain,
  contents: string
): boolean {
  return diagnosticMsgToString(diagMsg).indexOf(contents) >= 0
}

/**
 * @hidden
 */
export function assertFailCompile(contents: string, expectedMsg: string): void {
  fs.mkdirSync(path.dirname(TMP_FILENAME), { recursive: true })
  fs.writeFileSync(
    TMP_FILENAME,
    "import { HashSet, Stream, LinkedList, HashMap, Option, Either, Vector } from '@3fv/prelude-ts';" +
      contents
  )
  const tsProgram = ts.createProgram([TMP_FILENAME], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    noEmit: true,
    skipLibCheck: true,
    types: []
  })
  const allDiagnostics = ts.getPreEmitDiagnostics(tsProgram)
  const allErrorsTxt = allDiagnostics
    .map((x) => diagnosticMsgToString(x.messageText))
    .join(", ")
  // for some reason getting tons of 'cannot find module' errors
  // on circleCI. The test is otherwise still valid since i do "contains"
  // and the real error is still in there.
  //
  // if (allDiagnostics.length > 1) {
  //     console.log(allErrorsTxt);
  // }
  // assert.equal(1, allDiagnostics.length);
  const isMatch =
    allDiagnostics.filter((d) =>
      diagnosticMsgContains(d.messageText, expectedMsg)
    ).length > 0
  if (isMatch) {
    assert.ok(true)
  } else {
    assert.equal(allErrorsTxt, expectedMsg)
  }
  fs.unlinkSync(TMP_FILENAME)
}
