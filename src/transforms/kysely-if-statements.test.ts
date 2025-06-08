import { type ExpressionStatement, Project, SyntaxKind } from 'ts-morph'
import { describe, expect, test } from 'vitest'
import {
  extractExpressionsWithoutNestedIf,
  extractLastChainedMethod,
  findChainRoot,
  getDirectIfCallsInChain,
  isIfMethodCall,
  refactorChain,
} from './kysely-if-statements'

// Helper function to create a source file and get the first call expression
const getAST = (code: string): ExpressionStatement => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
    },
  })

  const sourceFile = project.createSourceFile('input.ts', code)
  const expressionStatement = sourceFile.getFirstDescendantByKind(
    SyntaxKind.ExpressionStatement,
  )
  if (!expressionStatement) {
    throw new Error('No expression statement found')
  }

  return expressionStatement
}

describe('extractExpressionsWithoutNestedIf', () => {
  test('should remove $if calls from a method chain', () => {
    const code = `
      db
        .selectFrom("table")
        .$if(typeof paginationOptions?.cursor !== 'undefined', (qb) =>
          qb.where('block.id', '<', paginationOptions?.cursor!))
        .orderBy('block.id', 'desc')
        .$if(typeof where.version?.gt === 'number', (qb) =>
          qb.where('block.version', '>', where.version?.gt))
        .limtest(paginationOptions?.limit)
    `

    const ast = getAST(code)

    const callExpression = ast.getFirstDescendantByKind(
      SyntaxKind.CallExpression,
    )!

    const result = extractExpressionsWithoutNestedIf(callExpression)
    expect(result).toMatchInlineSnapshot(`
      "db
        .selectFrom("table")
        .orderBy('block.id', 'desc')
        .limtest(paginationOptions?.limit)"
    `)
  })
})

describe('findChainRoot', () => {
  test('should find the root of a chain starting with db', () => {
    const code = `
      db
        .selectFrom("table")
        .$if(condition, (qb) => qb.where('id', '=', 1))
        .orderBy('id')
    `

    const ast = getAST(code)
    const call = ast
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find(isIfMethodCall)!

    const chainRoot = findChainRoot(call, ['db'])!
    expect(chainRoot).toBeDefined()
    expect(chainRoot.getText()).toMatchInlineSnapshot(`
      "db
              .selectFrom("table")
              .$if(condition, (qb) => qb.where('id', '=', 1))
              .orderBy('id')"
    `)
  })

  test('should return undefined for chains not starting with the specified variable', () => {
    const code = `
      otherDb
        .selectFrom("table")
        .$if(condition, (qb) => qb.where('id', '=', 1))
        .orderBy('id')
    `

    const ast = getAST(code)
    const call = ast
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find(isIfMethodCall)!

    const chainRoot = findChainRoot(call, ['db'])
    expect(chainRoot).toBeUndefined()
  })
})

describe('isIfMethodCall', () => {
  test('should identify $if method calls', () => {
    const code = `
      db.$if(true, (qb) => qb)
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    expect(isIfMethodCall(call)).toBe(true)
  })

  test('should return false for non-$if method calls', () => {
    const code = `
      db.selectFrom("table")
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    expect(isIfMethodCall(call)).toBe(false)
  })
})

// Example of testing with nested $if calls
describe('nested $if handling', () => {
  test('should handle nested $if calls in callbacks', () => {
    const code = `
      db
        .selectFrom('sequenceDocument')
        .$if(where.archived !== 'is-either', (qb) =>
          qb
            .innerJoin('document', 'document.id', 'sequenceDocument.documentId')
            .$if(where.archived === 'is-archived', (qb2) =>
              qb2.where('document.archivedAt', 'is not', null))
            .$if(where.archived === 'is-not-archived', (qb2) =>
              qb2.where('document.archivedAt', 'is', null))
        )
        .executeTakeFirst()
    `

    const ast = getAST(code)

    // Test your refactoring logic here
    // For example, find the outer $if call
    const outerIfCall = ast
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => {
        const expr = call.getExpression()
        if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
          const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
          return (
            prop.getName() === '$if' &&
            prop.getExpression().getText().includes('selectFrom')
          )
        }

        return false
      })

    expect(outerIfCall).toBeDefined()

    // Get the callback body
    const callback = outerIfCall?.getArguments()[1]
    expect(callback).toBeDefined()

    // You can now test your nested $if extraction logic
  })
})

describe('getDirectIfCallsInChain', () => {
  test('x', () => {
    const code = `
      db
        .selectFrom('block')
        .selectAll('block')
        .where('block.workspaceId', '=', workspaceId)
        .$if(Array.isArray(blockId?.in), (qb) =>
          qb.where('block.id', 'in', blockId?.in),
        )
        .$if(typeof documentId === 'string', (qb) =>
          qb.where('block.documentId', '=', documentId!),
        )
        .$if(typeof where.version?.gt === 'number', (qb) =>
          qb.where('block.version', '>', where.version?.gt),
        )
        .$if(typeof paginationOptions !== 'undefined', (qb) =>
          qb
            .$if(typeof paginationOptions?.cursor !== 'undefined', (qb) =>
              qb.where('block.id', '<', paginationOptions?.cursor!),
            )
            .orderBy('block.id', 'desc')
            .limtest(paginationOptions?.limit),
        )
        .execute()
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    const list = getDirectIfCallsInChain(call).map((item) => item.getText())
    expect(list).toMatchInlineSnapshot(`
      [
        "db
              .selectFrom('block')
              .selectAll('block')
              .where('block.workspaceId', '=', workspaceId)
              .$if(Array.isArray(blockId?.in), (qb) =>
                qb.where('block.id', 'in', blockId?.in),
              )",
        "db
              .selectFrom('block')
              .selectAll('block')
              .where('block.workspaceId', '=', workspaceId)
              .$if(Array.isArray(blockId?.in), (qb) =>
                qb.where('block.id', 'in', blockId?.in),
              )
              .$if(typeof documentId === 'string', (qb) =>
                qb.where('block.documentId', '=', documentId!),
              )",
        "db
              .selectFrom('block')
              .selectAll('block')
              .where('block.workspaceId', '=', workspaceId)
              .$if(Array.isArray(blockId?.in), (qb) =>
                qb.where('block.id', 'in', blockId?.in),
              )
              .$if(typeof documentId === 'string', (qb) =>
                qb.where('block.documentId', '=', documentId!),
              )
              .$if(typeof where.version?.gt === 'number', (qb) =>
                qb.where('block.version', '>', where.version?.gt),
              )",
        "db
              .selectFrom('block')
              .selectAll('block')
              .where('block.workspaceId', '=', workspaceId)
              .$if(Array.isArray(blockId?.in), (qb) =>
                qb.where('block.id', 'in', blockId?.in),
              )
              .$if(typeof documentId === 'string', (qb) =>
                qb.where('block.documentId', '=', documentId!),
              )
              .$if(typeof where.version?.gt === 'number', (qb) =>
                qb.where('block.version', '>', where.version?.gt),
              )
              .$if(typeof paginationOptions !== 'undefined', (qb) =>
                qb
                  .$if(typeof paginationOptions?.cursor !== 'undefined', (qb) =>
                    qb.where('block.id', '<', paginationOptions?.cursor!),
                  )
                  .orderBy('block.id', 'desc')
                  .limtest(paginationOptions?.limit),
              )",
      ]
    `)
  })
})

describe('refactorChain', () => {
  test('x', () => {
    const code = `
      db
        .selectFrom('block')
        .selectAll('block')
        .select((eb) => [
          eb
            .case()
            .when('type', '=', BlockType.DRAWING)
            .then(
              jsonObjectFrom(
                eb
                  .selectFrom('blockDrawing')
                  .select(['blockDrawing.title', 'blockDrawing.canvasId'])
                  .whereRef('blockDrawing.id', '=', 'block.blockDrawingId'),
              ),
            )
            .when('type', '=', BlockType.TEXT)
            .then(
              jsonObjectFrom(
                eb
                  .selectFrom('blockText')
                  .select(['blockText.title', 'blockText.contentId'])
                  .whereRef('blockText.id', '=', 'block.blockTextId'),
              ),
            )
            .end()
            .as('data'),
        ])
        .where('block.workspaceId', '=', workspaceId)
        .$if(Array.isArray(blockId?.in), (qb) =>
          qb.where('block.id', 'in', blockId?.in),
        )
        .$if(typeof documentId === 'string', (qb) =>
          qb.where('block.documentId', '=', documentId!),
        )
        .$if(typeof where.version?.gt === 'number', (qb) =>
          qb.where('block.version', '>', where.version?.gt),
        )
        .$if(typeof paginationOptions !== 'undefined', (qb) =>
          qb
            .$if(typeof paginationOptions?.cursor !== 'undefined', (qb) =>
              qb.where('block.id', '<', paginationOptions?.cursor!),
            )
            .orderBy('block.id', 'desc')
            .limit(paginationOptions?.limit),
        )
        .execute()
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    const output = refactorChain(call)
    expect(output).toMatchInlineSnapshot(`
      "let query = db
        .selectFrom('block')
        .selectAll('block')
        .select((eb) => [
                eb
                  .case()
                  .when('type', '=', BlockType.DRAWING)
                  .then(
                    jsonObjectFrom(
                      eb
                        .selectFrom('blockDrawing')
                        .select(['blockDrawing.title', 'blockDrawing.canvasId'])
                        .whereRef('blockDrawing.id', '=', 'block.blockDrawingId'),
                    ),
                  )
                  .when('type', '=', BlockType.TEXT)
                  .then(
                    jsonObjectFrom(
                      eb
                        .selectFrom('blockText')
                        .select(['blockText.title', 'blockText.contentId'])
                        .whereRef('blockText.id', '=', 'block.blockTextId'),
                    ),
                  )
                  .end()
                  .as('data'),
              ])
        .where('block.workspaceId', '=', workspaceId)

      if (Array.isArray(blockId?.in)) {
        query = query.where('block.id', 'in', blockId?.in)
      }
      if (typeof documentId === 'string') {
        query = query.where('block.documentId', '=', documentId!)
      }
      if (typeof where.version?.gt === 'number') {
        query = query.where('block.version', '>', where.version?.gt)
      }
      if (typeof paginationOptions !== 'undefined') {
        query = query
        .orderBy('block.id', 'desc')
        .limit(paginationOptions?.limit)
        if (typeof paginationOptions?.cursor !== 'undefined') {
          query = query.where('block.id', '<', paginationOptions?.cursor!)
        }
      }
      return query.execute()"
    `)
  })
})

describe('extractLastChainedMethod', () => {
  test('should extract executeTakeFirst from a chain', () => {
    const code = `
      db
        .selectFrom('table')
        .where('id', '=', 1)
        .executeTakeFirst()
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    const result = extractLastChainedMethod(call)

    expect(result.lastMethodName).toBe('executeTakeFirst')
    expect(result.chainWithoutLast.getText()).toMatchInlineSnapshot(`
      "db
              .selectFrom('table')
              .where('id', '=', 1)"
    `)
  })

  test('should handle executeTakeFirstOrThrow', () => {
    const code = `
      db
        .selectFrom('users')
        .$if(true, qb => qb.where('active', '=', true))
        .executeTakeFirstOrThrow()
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    const result = extractLastChainedMethod(call)

    expect(result.lastMethodName).toBe('executeTakeFirstOrThrow')
    expect(result.chainWithoutLast.getText()).toMatchInlineSnapshot(`
      "db
              .selectFrom('users')
              .$if(true, qb => qb.where('active', '=', true))"
    `)
  })

  test('should throw error for non-execute methods', () => {
    const code = `
      db
        .selectFrom('table')
        .where('id', '=', 1)
        .orderBy('name')
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    expect(() => extractLastChainedMethod(call)).toThrow(
      'Last method must be one of: execute, executeTakeFirst, executeTakeFirstOrThrow. Got: orderBy',
    )
  })

  test('should handle simple execute()', () => {
    const code = `
      db.updateTable('users').set({ name: 'John' }).execute()
    `

    const ast = getAST(code)
    const call = ast.getFirstDescendantByKind(SyntaxKind.CallExpression)!

    const result = extractLastChainedMethod(call)

    expect(result.lastMethodName).toBe('execute')
    expect(result.chainWithoutLast.getText()).toMatchInlineSnapshot(
      `"db.updateTable('users').set({ name: 'John' })"`,
    )
  })
})
