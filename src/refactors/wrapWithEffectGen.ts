import { pipe } from "effect/Function"
import * as LSP from "../core/LSP.js"
import * as Nano from "../core/Nano.js"
import * as AST from "../utils/AST.js"
import * as TypeScriptApi from "../utils/TypeScriptApi.js"

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
      const [effectExpr] = yield* pipe(
        AST.findEffectExpressionAtPosition(sourceFile, textRange.pos),
        Nano.mapError(() => new LSP.RefactorNotApplicableError())
      )
      const effectGen = yield* AST.createEffectGenCallExpressionWithBlock(
        yield* AST.getEffectModuleIdentifierName(sourceFile),
        yield* AST.createReturnYieldStarStatement(effectExpr)
      )
      return {
        kind: "refactor.rewrite.effect.wrapWithEffectGen",
        description: `Wrap with Effect.gen`,
        apply: Nano.gen(function*() {
          const changeTracker = yield* Nano.service(TypeScriptApi.ChangeTracker)
          changeTracker.replaceNode(sourceFile, effectExpr, effectGen)
        })
      }
    })
})
