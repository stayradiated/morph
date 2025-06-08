import {
  type NewExpression,
  Node,
  type NoSubstitutionTemplateLiteral,
  type ObjectLiteralExpression,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
  type TemplateExpression,
} from 'ts-morph'

export const projectRoot =
  '/home/admin/src/github.com/stayradiated/volatile/svc-server'

export const projectFiles = [`./src/**/*.ts`]

/*

New SimpleError({ message: 'my message', })

new ErrorWithContext({
  message: 'This is my message',
  context: { a, b, c },
})

new ErrorWithCause({
  message: 'This is my message',
  context: { a, b, c },
  cause: error
})

===

new SimpleError('my message')

new ErrorWithContext(`This is my message
${JSON.stringify({ a, b, c})}`)

new ErrorWithCause(`This is my message
${JSON.stringify({ a, b, c})}`, {
  cause: error
})

*/

const transformError = (node: NewExpression) => {
  const identifier = node.getFirstChildByKindOrThrow(SyntaxKind.Identifier)
  const errorClassName = identifier.getText()
  console.log('\n»', errorClassName)

  const syntaxList = node.getFirstChildByKindOrThrow(SyntaxKind.SyntaxList)

  if (
    syntaxList.getFirstChildByKind(SyntaxKind.TemplateExpression) ||
    syntaxList.getFirstChildByKind(SyntaxKind.StringLiteral)
  ) {
    console.log('Already has message, skipping...')
    return
  }

  const object = syntaxList.getFirstChildByKind(
    SyntaxKind.ObjectLiteralExpression,
  )
  if (!object) {
    console.log(`Does not have object, skipping...`)
    return
  }

  let message:
    | StringLiteral
    | TemplateExpression
    | NoSubstitutionTemplateLiteral
    | undefined
  let context: ObjectLiteralExpression | undefined
  let cause: Node | undefined

  for (const property of object.getProperties()) {
    const identifier = property.getFirstChildByKind(SyntaxKind.Identifier)
    const key = identifier?.getText()
    switch (key) {
      case 'message': {
        message =
          property.getFirstChildByKind(SyntaxKind.StringLiteral) ||
          property.getFirstChildByKind(SyntaxKind.TemplateExpression) ||
          property.getFirstChildByKind(SyntaxKind.NoSubstitutionTemplateLiteral)
        break
      }

      case 'context': {
        context = property.getFirstChildByKindOrThrow(
          SyntaxKind.ObjectLiteralExpression,
        )
        break
      }

      case 'cause': {
        cause = property.getChildAtIndex(2)
        break
      }

      default: {
        throw new Error(`Unrecognised property: ${key}`)
      }
    }
  }

  if (!message) {
    throw new Error('Could not find "message" property.')
  }

  const messageText = message.getText()

  let replacementNodeText = `new ${errorClassName}(${messageText})`

  if (context && cause) {
    const errorMessage = message.getText().slice(1, -1)
    replacementNodeText = `new ${errorClassName}(\`${errorMessage}
\${JSON.stringify(${context.getText()})}\`, {cause: ${cause.getText()}})`
  }

  if (context) {
    const errorMessage = message.getText().slice(1, -1)
    replacementNodeText = `new ${errorClassName}(\`${errorMessage}
\${JSON.stringify(${context.getText()})}\`)`
  }

  if (cause) {
    replacementNodeText = `new ${errorClassName}(${messageText}, {cause: ${cause.getText()}})`
  }

  node.replaceWithText(replacementNodeText)
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
