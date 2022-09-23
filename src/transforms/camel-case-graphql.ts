import path from 'node:path'
import type { SourceFile, TaggedTemplateExpression } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import camelCase from 'camelcase'

export const projectRoot = '/home/admin/src/github.com/Runn-Fast/runn'

export const projectFiles = ['./app/javascript/src/**/*.{tsx,ts}']

const titleCase = (word: string): string => {
  if (word.length === 0) {
    return word
  }

  return word[0]!.toUpperCase() + camelCase(word).slice(1)
}

const snakeCase = (word: string): string => {
  return camelCase(word)
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toLowerCase()
}

const toRelayName = (input: string, relayPrefix: string): string => {
  if (!input.toLowerCase().startsWith(relayPrefix.toLowerCase())) {
    throw new Error(
      `Query name "${input}" does start with relay prefix: "${relayPrefix}"`,
    )
  }

  const output = relayPrefix + input.slice(relayPrefix.length)
  return output
}

const blackList = new Set([
  'query_root',
  'mutation_root',
  'pk_columns',
  'affected_rows',
  'update_columns',
  'projects_pkey',
])

const typeList = new Set(['string', 'int', 'boolean'])

const enums = new Set(['asc', 'desc'])

const camelCaseGraphQLQuery = (input: string, filename: string): string => {
  const relayPrefixFromFilename = /^\w+/.exec(filename)![0]!

  return input
    .replace(/\w+/g, (word) => {
      if (blackList.has(word)) {
        return word
      }

      if (enums.has(word.toLowerCase())) {
        return word.toUpperCase()
      }

      if (
        typeList.has(word.toLowerCase()) ||
        word.endsWith('_input') ||
        word.endsWith('Input') ||
        word.endsWith('_bool_exp') ||
        word.endsWith('BoolExp')
      ) {
        return titleCase(word)
      }

      if (word.startsWith('_')) {
        return '_' + camelCase(word)
      }

      return camelCase(word)
    })
    .replace(/fragment (\w+) on (\w+)/g, (_line, fragmentName, modelName) => {
      modelName = blackList.has(modelName) ? modelName : titleCase(modelName)
      fragmentName = toRelayName(fragmentName, relayPrefixFromFilename)
      return `fragment ${fragmentName} on ${modelName}`
    })
    .replace(/\.{3}(\w+)/g, (_line, fragmentName) => {
      fragmentName = fragmentName.startsWith('use')
        ? fragmentName
        : titleCase(fragmentName)
      return `...${fragmentName}`
    })
    .replace(
      /(query|mutation|subscription) (\w+)/g,
      (_line, queryType, queryName) => {
        queryName = toRelayName(queryName, relayPrefixFromFilename)
        return `${queryType} ${queryName}`
      },
    )
    .replace(/args: {([^}]+)}/g, (_line, args: string) => {
      return (
        'args: {' +
        args
          .split(',')
          .map((pair) => {
            const [key, value] = pair.trim().split(':')
            return `${snakeCase(key!)}: ${value}`
          })
          .join(',') +
        '}'
      )
    })
}

const transformGraphQLQuery = (
  node: TaggedTemplateExpression,
  filename: string,
) => {
  const template = node.getFirstChildByKindOrThrow(
    SyntaxKind.NoSubstitutionTemplateLiteral,
  )
  template.replaceWithText(camelCaseGraphQLQuery(template.getText(), filename))
}

export const transformSourceFile = (sourceFile: SourceFile) => {
  const filename = path.basename(sourceFile.getFilePath().toString())

  sourceFile.forEachDescendant((node) => {
    if (Node.isTaggedTemplateExpression(node)) {
      const identifier = node.getFirstChildByKind(SyntaxKind.Identifier)
      const name = identifier?.getText()
      if (name === 'graphql') {
        transformGraphQLQuery(node, filename)
      }
    }
  })
}
