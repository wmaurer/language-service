/**
 * @since 1.0.0
 */
import { pipe } from "effect/Function"
import * as O from "effect/Option"
import type ts from "typescript"
import { refactors } from "./refactors.js"
import * as AST from "./utils/AST.js"

const init = (
  modules: {
    typescript: typeof ts
  }
) => {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const languageService = info.languageService

    // create the proxy
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      // @ts-expect-error
      proxy[k] = (...args: Array<{}>) => languageService[k]!.apply(languageService, args)
    }

    proxy.getApplicableRefactors = (...args) => {
      const applicableRefactors = languageService.getApplicableRefactors(...args)
      const [fileName, positionOrRange] = args
      const program = languageService.getProgram()

      if (program) {
        const textRange = AST.toTextRange(positionOrRange)
        const effectRefactors = pipe(
          AST.getSourceFile(program)(fileName),
          (sourceFile) =>
            pipe(
              Object.values(refactors).map((refactor) =>
                pipe(
                  refactor.apply(modules.typescript, program)(sourceFile, textRange),
                  O.map((_) => ({
                    name: refactor.name,
                    description: refactor.description,
                    actions: [{
                      name: refactor.name,
                      description: _.description,
                      kind: _.kind
                    }]
                  }))
                )
              ),
              (_) =>
                _.reduce(
                  (arr, maybeRefactor) =>
                    arr.concat(O.isSome(maybeRefactor) ? [maybeRefactor.value] : []),
                  [] as Array<ts.ApplicableRefactorInfo>
                )
            )
        )

        info.project.projectService.logger.info(
          "[@effect/language-service] possible refactors are " + JSON.stringify(effectRefactors)
        )

        return applicableRefactors.concat(effectRefactors)
      }
      return applicableRefactors
    }

    proxy.getEditsForRefactor = (
      fileName,
      formatOptions,
      positionOrRange,
      refactorName,
      actionName,
      preferences,
      ...args
    ) => {
      const program = languageService.getProgram()
      if (program) {
        for (const refactor of Object.values(refactors)) {
          if (refactor.name === refactorName) {
            const sourceFile = AST.getSourceFile(program)(fileName)
            const textRange = AST.toTextRange(positionOrRange)
            const possibleRefactor = refactor.apply(modules.typescript, program)(
              sourceFile,
              textRange
            )

            if (O.isNone(possibleRefactor)) {
              info.project.projectService.logger.info(
                "[@effect/language-service] requested refactor " + refactorName +
                  " is not applicable"
              )
              return { edits: [] }
            }

            const formatContext = ts.formatting.getFormatContext(
              formatOptions,
              info.languageServiceHost
            )
            const edits = ts.textChanges.ChangeTracker.with(
              {
                formatContext,
                host: info.languageServiceHost,
                preferences: preferences || {}
              },
              (changeTracker) => possibleRefactor.value.apply(changeTracker)
            )

            return { edits }
          }
        }
      }

      return languageService.getEditsForRefactor(
        fileName,
        formatOptions,
        positionOrRange,
        refactorName,
        actionName,
        preferences,
        ...args
      )
    }

    return proxy
  }

  return { create }
}

module.exports = init
