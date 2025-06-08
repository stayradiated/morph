import path from 'node:path'
import { Node, type SourceFile, SyntaxKind } from 'ts-morph'

export const projectRoot = '/home/admin/src/github.com/Runn-Fast/runn'

export const projectFiles = [
  `./app/javascript/src/**/*.ts`,
  '!**/__generated__/*',
  '!**/__tests__/*',
]

/*

Import { DBError } from '../../util/error'

===

import { DbError } from '~/util/error'

*/

const srcRoot = `${projectRoot}/app/javascript/src`

const resolveAbsoluteImport = (
  sourceFilePath: string,
  importPath: string,
): string => {
  const prefix = path.relative(sourceFilePath, srcRoot)
  return path.join(prefix, importPath.slice(1))
}

export const transformSourceFile = (sourceFile: SourceFile) => {
  const sourceFilePath = sourceFile.getFilePath()
  const sourceFileDir = path.dirname(sourceFilePath)

  sourceFile.forEachDescendant((node) => {
    if (Node.isImportDeclaration(node)) {
      const stringLiteralNode = node.getFirstChildByKind(
        SyntaxKind.StringLiteral,
      )
      if (!stringLiteralNode) {
        return
      }

      const rawImportPath = stringLiteralNode.getLiteralValue()

      const importPath = rawImportPath.startsWith('~')
        ? resolveAbsoluteImport(sourceFilePath, rawImportPath)
        : rawImportPath

      if (!importPath.startsWith('.')) {
        return
      }

      const absolutePath = path.resolve(sourceFileDir, importPath)

      const rawRelativePath = path.relative(sourceFileDir, absolutePath)

      const relativePath =
        rawRelativePath === ''
          ? './index'
          : rawRelativePath.endsWith('.')
            ? `${rawRelativePath}/index`
            : rawRelativePath.startsWith('.')
              ? rawRelativePath
              : `./${rawRelativePath}`

      if (relativePath.startsWith('./')) {
        if (relativePath !== rawImportPath) {
          console.log([rawImportPath, relativePath])
          stringLiteralNode.setLiteralValue(relativePath)
        }

        return
      }

      const relativeToSrcPath = path.relative(srcRoot, absolutePath)

      // Skip imports that outside of srcRoot
      if (relativeToSrcPath.startsWith('../')) {
        return
      }

      const newImportPath = `~/${relativeToSrcPath}`

      if (rawImportPath !== newImportPath) {
        console.log([rawImportPath, newImportPath])
        stringLiteralNode.setLiteralValue(newImportPath)
      }
    }
  })
}
