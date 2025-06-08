import path from 'node:path'
import { green, red } from 'colorette'
import { Node, type SourceFile, SyntaxKind } from 'ts-morph'

export const projectRoot =
  '/home/admin/src/github.com/Runn-Fast/runn/services/node-server'

export const projectFiles = ['./src/**/*.ts']

/*
 
=== BEFORE ==

import { fastify } from 'fastify'
import { Error } from '.util/error'

=== AFTER ===

import { fastify } from 'fastify'
import { Error } from './util/error.js'

*/

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

      const importPath = stringLiteralNode.getLiteralValue()
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

      const newImportPath = relativePath.endsWith('.js')
        ? relativePath
        : `${relativePath}.js`

      if (importPath !== newImportPath) {
        console.log(`
- ${red(importPath)}
+ ${green(newImportPath)}`)
        stringLiteralNode.setLiteralValue(newImportPath)
      }
    }
  })
}
