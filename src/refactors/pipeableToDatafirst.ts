import { createRefactor } from "@effect/language-service/refactors/definition"
import * as AST from "@effect/language-service/utils/AST"
import { pipe } from "@effect/language-service/utils/Function"
import * as O from "@effect/language-service/utils/Option"
import * as Ch from "@effect/language-service/utils/ReadonlyArray"

export default createRefactor({
  name: "effect/pipeableToDatafirst",
  description: "Rewrite to datafirst",
  apply: (ts, program) =>
    (sourceFile, textRange) =>
      pipe(
        AST.getNodesContainingRange(ts)(sourceFile, textRange),
        Ch.filter(AST.isPipeCall(ts)),
        Ch.filter((node) => AST.isNodeInRange(textRange)(node.expression)),
        Ch.filter(
          (node) => node.arguments.length > 0
        ),
        Ch.map((node) => {
          let newNode = node.arguments[0]
          let didSomething = false
          for (let i = 1; i < node.arguments.length; i++) {
            const arg = node.arguments[i]
            const a = AST.asDataFirstExpression(ts, program.getTypeChecker())(arg, newNode)
            if (O.isSome(a)) {
              // use found datafirst
              newNode = a.value
              didSomething = true
            } else {
              if (AST.isPipeCall(ts)(newNode)) {
                // avoid nested pipe(a, pipe(b, c))
                newNode = ts.factory.createCallExpression(
                  ts.factory.createIdentifier("pipe"),
                  [],
                  newNode.arguments.concat([arg])
                )
              } else {
                // no datafirst, keep pipeable
                newNode = ts.factory.createCallExpression(ts.factory.createIdentifier("pipe"), [], [newNode, arg])
              }
            }
          }
          return didSomething ? O.some([node, newNode] as const) : O.none
        }),
        Ch.filter(O.isSome),
        Ch.map((_) => _.value),
        Ch.head,
        O.map(([node, newNode]) => ({
          kind: "refactor.rewrite.effect.pipeableToDatafirst",
          description: "Rewrite to datafirst",
          apply: (changeTracker) => {
            changeTracker.replaceNode(sourceFile, node, newNode)
          }
        }))
      )
})
