import camelCase from 'camelcase'
import {
  type Identifier,
  type ImportDeclaration,
  Node,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
} from 'ts-morph'

export const projectRoot = '/home/admin/src/github.com/Runn-Fast/runn'

export const projectFiles = [
  './app/javascript/src/**/*.{tsx,ts}',
  // './app/javascript/src/common/SuperSearch/Filters/common/useProjects.ts'
]

// Export const projectRoot = '/home/admin/src/github.com/Runn-Fast/runn/services/filter-engine'
// export const projectFiles = [ './src/**/*.ts' ]

const titleCase = (word: string): string => {
  if (word.length === 0) {
    return word
  }

  return word[0].toUpperCase() + camelCase(word).slice(1)
}

const transformIdentifier = (node: Identifier) => {
  const text = node.getText()

  if (
    // We are ignoring identifiers that start with an underscore
    text.indexOf('_') >= 1 &&
    // We are skipping identifiers that are ALL_CAPS
    text.toUpperCase() !== text
  ) {
    const isTitleCase = text[0].toUpperCase() === text[0]
    const updatedText = isTitleCase ? titleCase(text) : camelCase(text)
    console.log(text, '→', updatedText)
    node.replaceWithText(updatedText)
  }
}

const transformImportDeclaration = (node: ImportDeclaration) => {
  const stringLiteral = node.getFirstChildByKind(SyntaxKind.StringLiteral)
  if (!stringLiteral) {
    return
  }

  const importPath = stringLiteral.getLiteralText()
  if (importPath.includes('/__generated__')) {
    const quoteKind = stringLiteral.getQuoteKind().toString()

    const updatedImportPath = importPath.replace(
      /(\w+).graphql$/,
      (_line, filename) => {
        const updateFilename = filename.startsWith('use')
          ? camelCase(filename)
          : titleCase(filename)
        return `${updateFilename}.graphql`
      },
    )

    stringLiteral.replaceWithText(
      `${quoteKind}${updatedImportPath}${quoteKind}`,
    )
  }
}

const transformStringLiteral = (node: StringLiteral) => {
  const text = node.getLiteralText()
  if (/^[a-z]\w*_\w+$/.test(text)) {
    const quoteKind = node.getQuoteKind().toString()
    const updatedText = camelCase(text)
    console.log(`"${text}" → "${updatedText}"`)
    node.replaceWithText(`${quoteKind}${updatedText}${quoteKind}`)
  }
}

export const transformSourceFile = (sourceFile: SourceFile) => {
  const filepath = sourceFile.getFilePath().toString()

  if (filepath.includes('/__generated__/')) {
    return
  }

  sourceFile.forEachDescendant((node) => {
    if (Node.isIdentifier(node)) {
      transformIdentifier(node)
    } else if (Node.isStringLiteral(node)) {
      transformStringLiteral(node)
    } else if (Node.isImportDeclaration(node)) {
      transformImportDeclaration(node)
    }
  })
}
