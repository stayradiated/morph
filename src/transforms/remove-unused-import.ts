import type { SourceFile } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

export const projectRoot =
  '/home/admin/src/github.com/stayradiated/volatile/svc-server'

export const projectFiles = ['./src/**/*.ts']

/*

Import { DbError, messageWithContext } from '../../util/error.js'

===

import { DbError } from '../../util/error.js'

*/

export const transformSourceFile = (sourceFile: SourceFile) => {
  const importName = 'messageWithContext'

  const matches = sourceFile
    .getText()
    .match(new RegExp(`\\b${importName}\\b`, 'g'))

  // Only 1 match means that we have imported but not used
  if (matches && matches.length === 1) {
    sourceFile.forEachDescendant((node) => {
      if (Node.isImportDeclaration(node)) {
        const clause = node.getFirstChildByKind(SyntaxKind.ImportClause)
        if (!clause) {
          return
        }

        const namedImports = clause.getFirstChildByKind(SyntaxKind.NamedImports)
        if (!namedImports) {
          return
        }

        const importList = namedImports.getChildrenOfKind(
          SyntaxKind.ImportSpecifier,
        )
        for (const importNode of importList) {
          const identifier = importNode.getFirstChildByKind(
            SyntaxKind.Identifier,
          )
          if (!identifier) {
            continue
          }

          if (identifier.getText() === importName) {
            console.log(node.getText())
            importNode.remove()
          }
        }
      }
    })
  }
}
