import { pipe } from "effect/Function"
import * as LSP from "../core/LSP.js"
import * as Nano from "../core/Nano.js"
import * as AST from "../utils/AST.js"
import * as TypeScriptApi from "../utils/TypeScriptApi.js"

// extra imports
import * as ReadonlyArray from "effect/Array"
import * as Option from "effect/Option"
import type ts from "typescript"
import * as TypeCheckerApi from "../utils/TypeCheckerApi.js"
import * as TypeParser from "../utils/TypeParser.js"

/**
 * Refactor to wrap an `Effect` expression with `Effect.gen`.
 *
 * This refactor identifies an `Effect` expression at the specified position and wraps it
 * in an `Effect.gen` generator function. The original `Effect` expression is transformed
 * into a `yield*` statement within the generator function, and the resulting generator
 * function is returned as the new `Effect.gen` call.
 *
 * The function works by analyzing the AST within the specified `textRange` to locate
 * an `Effect` expression. It then constructs a new `Effect.gen` call that wraps the
 * original `Effect` expression, making it part of a generator function.
 *
 * @example
 * Input:
 * ```ts
 * const result = Effect.succeed(42)
 * ```
 * Output:
 * ```ts
 * const result = Effect.gen(function* () {
 *   return yield* Effect.succeed(42)
 * })
 * ```
 *
 * @param ts - The TypeScript API.
 * @param program - The TypeScript program instance, used for type checking.
 * @returns A refactor function that takes a `SourceFile` and a `TextRange`, analyzes the AST,
 *          and applies the refactor if applicable.
 */
export const wrapWithEffectGen = LSP.createRefactor({
  name: "effect/wrapWithEffectGen",
  description: "Wrap with Effect.gen",
  apply: (sourceFile, textRange) =>
    Nano.gen(function*() {
      // TODO: when the cursor is on test1 above, this xxx passes. it should not
      // it should only work on an expression
      const xxx = Nano.fn("xxx")(function*(node: ts.Node) {
        const ts = yield* Nano.service(TypeScriptApi.TypeScriptApi)
        // TODO: this should be a typeparserIssue!!!
        if (!ts.isExpression(node)) return yield* Nano.fail("is not an expression")
        // if (ts.isIdentifier(node)) return yield* Nano.fail("is an identifier")
        // if (ts.isVariableDeclaration(node)) return yield* Nano.fail("is a variable declaration")
        if (
          node.parent != null && ts.isVariableDeclaration(node.parent) &&
          node.parent.initializer !== node
        ) {
          return yield* Nano.fail("is lhs")
        }

        const typeChecker = yield* Nano.service(TypeCheckerApi.TypeCheckerApi)
        const type = typeChecker.getTypeAtLocation(node)
        yield* TypeParser.effectType(type, node)
        return node
      })

      const nodes = yield* AST.getAncestorNodesInRange(sourceFile, textRange)

      const ts = yield* Nano.service(TypeScriptApi.TypeScriptApi)
      const result = yield* Nano.all(...ReadonlyArray.map(
        nodes,
        (n) => {
          return pipe(
            Nano.option(xxx(n)),
            Nano.map((x) => ({
              text: n.getFullText(),
              isExpression: ts.isExpression(n),
              isEmptyStatement: ts.isEmptyStatement(n),
              isExpressionStatement: ts.isExpressionStatement(n),
              isVariableDeclaration: ts.isVariableDeclaration(n),
              isRHS: n.parent != null && ts.isVariableDeclaration(n.parent) &&
                n.parent.initializer === n,
              // isRHS: ts.isVariableDeclaration(n.parent),
              // parentKind: n.parent == null ? "null" : n.parent.kind,
              isIdentifier: ts.isIdentifier(n),
              kind: n.kind,
              x: Option.match(x, {
                onNone: () => "none",
                onSome: () => "some"
              }),
              node: n
            }))
          )
        }
      ))
      // console.log("foobar nodesxy", JSON.stringify(result, null, 2))

      const maybeNode = yield* pipe(
        yield* AST.getAncestorNodesInRange(sourceFile, textRange),
        ReadonlyArray.map(xxx),
        Nano.firstSuccessOf,
        Nano.option
      )
      // const maybeNode = yield* pipe(AST.findNodeAtPosition(sourceFile, textRange.pos), Nano.option)

      // const maybeNode = ReadonlyArray.findLast(result, (x) => x.x === "some")
      if (Option.isNone(maybeNode)) return yield* Nano.fail(new LSP.RefactorNotApplicableError())

      console.log("foobar maybeNode", maybeNode.value.getFullText())

      const node = maybeNode.value
      if (!ts.isExpression(node)) return yield* Nano.fail(new LSP.RefactorNotApplicableError())

      // const node = maybeNode.value

      // TODO: getEffectModuleIdentifierName can be replaced with a different approach
      // in order like in effectGenToFn
      const effectGen = yield* AST.createEffectGenCallExpressionWithBlock(
        yield* getEffectModuleIdentifierName(sourceFile),
        yield* createReturnYieldStarStatement(node)
      )
      return {
        kind: "refactor.rewrite.effect.wrapWithEffectGen",
        description: `Wrap with Effect.gen`,
        apply: Nano.gen(function*() {
          const changeTracker = yield* Nano.service(TypeScriptApi.ChangeTracker)
          changeTracker.replaceNode(sourceFile, node, effectGen)
        })
      }
    })
})

export function getEffectModuleIdentifierName(
  sourceFile: ts.SourceFile
) {
  return Nano.gen(function*() {
    return Option.match(
      yield* Nano.option(
        AST.findImportedModuleIdentifier(
          sourceFile,
          (node) =>
            pipe(
              TypeParser.importedEffectModule(node),
              Nano.option,
              Nano.map(Option.isSome)
            )
        )
      ),
      {
        onNone: () => "Effect",
        onSome: (node) => node.text
      }
    )
  })
}

export function createReturnYieldStarStatement(
  expr: ts.Expression
) {
  return Nano.gen(function*() {
    const ts = yield* Nano.service(TypeScriptApi.TypeScriptApi)
    return ts.factory.createReturnStatement(
      ts.factory.createYieldExpression(
        ts.factory.createToken(ts.SyntaxKind.AsteriskToken),
        expr
      )
    )
  })
}
