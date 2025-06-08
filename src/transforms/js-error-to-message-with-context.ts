import { type NewExpression, Node, type SourceFile, SyntaxKind } from 'ts-morph'

export const projectRoot =
  '/home/admin/src/github.com/stayradiated/volatile/svc-server'

export const projectFiles = ['./src/**/*.ts']

/*

New ErrorWithContext(`This is my message
${JSON.stringify({ a, b, c})}`)

new ErrorWithCause(`This is my message
${JSON.stringify({ a, b, c})}`, {
  cause: error
})

===

new ErrorWithContext(messageWithContext('This is my message', { a, b, c }))

new ErrorWithCause(messageWithContext('This is my message, { a, b, c }), {
  cause: error
})

*/

const transformError = (node: NewExpression) => {
  const identifier = node.getFirstChildByKindOrThrow(SyntaxKind.Identifier)
  const errorClassName = identifier.getText()
  console.log('\n»', errorClassName)

  const syntaxList = node.getFirstChildByKindOrThrow(SyntaxKind.SyntaxList)

  const templateExpression = syntaxList.getFirstChildByKind(
    SyntaxKind.TemplateExpression,
  )

  if (!templateExpression) {
    console.log(`Does not have template expression, skipping...`)
    return
  }

  const fullText = templateExpression.getText()
  const indexOfJson = fullText.indexOf('${JSON.stringify({')
  if (indexOfJson !== -1) {
    const message = fullText.slice(1, indexOfJson).trim()
    const context = /JSON.stringify\({([^}]+)}\)/
      .exec(fullText.slice(indexOfJson))?.[1]
      ?.trim()
    console.log({ message, context })
    templateExpression.replaceWithText(
      `messageWithContext(\`${message}\`, { ${context} })`,
    )
  }
}

export const transformSourceFile = (sourceFile: SourceFile) => {
  sourceFile.forEachDescendant((node) => {
    if (Node.isNewExpression(node)) {
      const identifier = node.getFirstChildByKind(SyntaxKind.Identifier)
      const name = identifier?.getText()
      if (name?.endsWith('Error')) {
        transformError(node)
      }
    }
  })
}
