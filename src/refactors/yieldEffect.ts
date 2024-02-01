import { createRefactor } from "@effect/language-service/refactors/definition"
import * as AST from "@effect/language-service/utils/AST"
import { pipe } from "@effect/language-service/utils/Function"
import * as O from "@effect/language-service/utils/Option"
import * as Ch from "@effect/language-service/utils/ReadonlyArray"
import type ts from "typescript/lib/tsserverlibrary"

export default createRefactor({
  name: "effect/yieldEffect",
  description: "Convert to yield Effect",
  apply: (ts, program) =>
    (sourceFile, textRange) => {
      return pipe(
        AST.getNodesContainingRange(ts)(sourceFile, textRange),
        getCallExpression(ts, program),
        O.map(({ adapterVariable, effectCallExpression }) => ({
          kind: "refactor.rewrite.effect.yieldEffect",
          description: "Rewrite to yield Effect",
          apply: (changeTracker) => {
            const yieldEffectExpression = ts.factory.createYieldExpression(
              ts.factory.createToken(ts.SyntaxKind.AsteriskToken),
              ts.factory.createCallExpression(ts.factory.createIdentifier(adapterVariable), undefined, [
                effectCallExpression
              ])
            )
            changeTracker.replaceNode(sourceFile, effectCallExpression, yieldEffectExpression)
          }
        }))
      )
    }
})

const getCallExpression = (ts: AST.TypeScriptApi, program: ts.Program) =>
  (nodes: Ch.Chunk<ts.Node>) =>
    pipe(
      O.some({
        parentExpressionStatements: pipe(
          nodes,
          Ch.filter((node): node is ts.ExpressionStatement => node.kind === ts.SyntaxKind.ExpressionStatement)
        )
      }),
      O.bind("effectCallExpression", ({ parentExpressionStatements }) =>
        pipe(
          parentExpressionStatements,
          Ch.head,
          O.map((a) => a.expression),
          O.map((a) => {
            const propertyAccess = (a.getChildAt(0) as ts.PropertyAccessExpression)
            console.log("aaa", propertyAccess.getChildren().map((a) => a.getText()))
            const foo = propertyAccess.getChildAt(0)
            const symbol = program.getTypeChecker().getTypeAtLocation(foo).getSymbol()
            // console.log("bbb", symbol?.exports?.keys())
            if (symbol && symbol.exports) {
              console.log("bbb", symbol.exports.get("Effect" as any)?.escapedName)
            }
            return a
          }),
          O.filter((callExpression) =>
            program.getTypeChecker().getTypeAtLocation(callExpression).getSymbol()
              ?.escapedName ===
              "Effect"
          )
        )),
      O.bind("adapterVariable", ({ parentExpressionStatements }) =>
        pipe(
          parentExpressionStatements,
          Ch.get(1),
          O.flatMap((a) => {
            const callExpression = a.expression
            if (callExpression.getChildAt(0).kind !== ts.SyntaxKind.PropertyAccessExpression) return O.none
            if (callExpression.getChildAt(0).getText() !== "Effect.gen") return O.none
            const syntaxList = callExpression.getChildAt(2)
            if (!syntaxList) return O.none
            if (syntaxList.kind !== ts.SyntaxKind.SyntaxList) return O.none
            const fun = syntaxList.getChildAt(0)
            if (!fun) return O.none
            if (fun.kind !== ts.SyntaxKind.FunctionExpression) return O.none
            const funChild1 = fun.getChildAt(1)
            if (!funChild1) return O.none
            if (funChild1.kind !== ts.SyntaxKind.AsteriskToken) return O.none
            const funSyntaxChild = fun.getChildAt(3)
            if (!funSyntaxChild) return O.none
            if (funSyntaxChild.kind !== ts.SyntaxKind.SyntaxList) return O.none
            const parameter = funSyntaxChild.getChildAt(0)
            if (!parameter) return O.none
            if (parameter.kind !== ts.SyntaxKind.Parameter) return O.none
            return O.some(parameter.getText())
          })
        ))
    )
