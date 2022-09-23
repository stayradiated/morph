import type { TypeAliasDeclaration, SourceFile } from 'ts-morph'
import { Node, SyntaxKind, VariableDeclarationKind } from 'ts-morph'
import camelCase from 'camelcase'

export const projectRoot =
  '/home/admin/src/github.com/stayradiated/volatile/svc-server'

export const projectFiles = ['./src/action/**/*.ts']

/*

Type Input = {
  user_uid: string
}

type Output = {
  user_uid: string
}

===

const schema = {
  input: {
    userUid: z.string(),
  },
  output: {
    userUid: z.string(),
  }
}

*/

type Schema = {
  input: Record<string, string>
  output: Record<string, string>
}

const generateSchema = (schema: Schema): string => {
  return `{
  input: {
    ${Object.entries(schema.input)
      .map(([key, value]) => {
        return `${key}: ${value},`
      })
      .join('\n    ')}
  },
  output: {
    ${Object.entries(schema.output)
      .map(([key, value]) => {
        return `${key}: ${value},`
      })
      .join('\n    ')}
  },
}`
}

const toZodType = (type: string): string => {
  let isOptional = false

  if (type.endsWith('| undefined')) {
    type = type.split('| undefined')[0]!.trim()
    isOptional = true
  }

  const zType = {
    boolean: `z.boolean()`,
    number: `z.number()`,
    string: `z.string()`,
    'Record<string, number>': `z.record(z.number())`,
    'Record<string, string>': `z.record(z.string())`,
  }[type]

  if (!zType) {
    throw new Error(`Unknown type: "${type}"`)
  }

  if (isOptional) {
    return `z.optional(${zType})`
  }

  return zType
}

export const transformSourceFile = (sourceFile: SourceFile) => {
  const schema: Schema = { input: {}, output: {} }
  let inputNode: TypeAliasDeclaration | undefined
  let outputNode: TypeAliasDeclaration | undefined

  const addToSchema = (
    record: Record<string, string>,
    node: TypeAliasDeclaration,
  ) => {
    const children = node
      .getTypeNode()
      ?.getChildrenOfKind(SyntaxKind.PropertySignature)
    if (children) {
      for (const child of children) {
        const key = camelCase(child.getName())
        const type = child.getType().getText()
        const zodType = toZodType(type)
        record[key] = zodType
      }
    }
  }

  sourceFile.forEachDescendant((node) => {
    if (Node.isTypeAliasDeclaration(node)) {
      const name = node.getName()
      if (name === 'Input') {
        inputNode = node
        addToSchema(schema.input, inputNode)
      }

      if (name === 'Output') {
        outputNode = node
        addToSchema(schema.output, outputNode)
      }
    }
  })

  if (!inputNode || !outputNode) {
    console.error('Could not find both input and output nodes!')
    return
  }

  sourceFile.insertVariableStatement(inputNode.getChildIndex(), {
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'schema',
        initializer: generateSchema(schema),
      },
    ],
  })

  inputNode.remove()
  outputNode.remove()

  sourceFile.insertImportDeclaration(0, {
    namespaceImport: 'z',
    moduleSpecifier: 'zod',
  })
}
