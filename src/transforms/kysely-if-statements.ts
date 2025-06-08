import {
  type CallExpression,
  type Node,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph'

// Configuration
const projectRoot = '/home/admin/src/github.com/roughapp/rough.app'
const projectFiles = ['./src/**/*.ts']

const transformSourceFile = (sourceFile: SourceFile): void => {
  // Find all method chains that contain .$if
  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )

  // Group call expressions by their chain root
  const chainRoots = new Set<CallExpression>()

  for (const callExpr of callExpressions) {
    if (isIfMethodCall(callExpr)) {
      const chainRoot = findChainRoot(callExpr, ['db', 'dbtx'])
      if (chainRoot && !chainRoots.has(chainRoot)) {
        chainRoots.add(chainRoot)
      }
    }
  }

  // Process each chain
  for (const chainRoot of chainRoots) {
    const nextChainRoot = refactorChain(chainRoot)
    if (nextChainRoot) {
      // Find the statement containing the chain
      let statement: CallExpression = chainRoot
      while (
        statement &&
        statement.getKind() !== SyntaxKind.VariableStatement &&
        statement.getKind() !== SyntaxKind.ReturnStatement &&
        statement.getKind() !== SyntaxKind.ExpressionStatement
      ) {
        statement = statement.getParent() as CallExpression
      }
      if (!statement) {
        throw new Error('Could not find statement')
      }
      statement.replaceWithText(nextChainRoot)
    }
  }
}

const isIfMethodCall = (node: CallExpression): boolean => {
  const expression = node.getExpression()
  if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propertyAccess = expression.asKindOrThrow(
      SyntaxKind.PropertyAccessExpression,
    )
    return propertyAccess.getName() === '$if'
  }

  return false
}

const findChainRoot = (
  node: CallExpression,
  variableNameList: string[],
): CallExpression | undefined => {
  let current: CallExpression = node
  let lastValidRoot: CallExpression = node

  while (current) {
    const parent = current.getParent()

    // Stop if we hit a statement or declaration
    if (
      !parent ||
      parent.getKind() === SyntaxKind.VariableStatement ||
      parent.getKind() === SyntaxKind.ReturnStatement ||
      parent.getKind() === SyntaxKind.ExpressionStatement ||
      parent.getKind() === SyntaxKind.Block
    ) {
      // Check if the root starts with the specified variable name
      if (isChainStartingWithVariable(lastValidRoot, variableNameList)) {
        return lastValidRoot
      }

      return undefined
    }

    // If parent is a call expression or property access, continue up
    if (
      parent.getKind() === SyntaxKind.CallExpression ||
      parent.getKind() === SyntaxKind.PropertyAccessExpression
    ) {
      lastValidRoot = parent as CallExpression
      current = parent as CallExpression
    } else {
      // Check if the root starts with the specified variable name
      if (isChainStartingWithVariable(lastValidRoot, variableNameList)) {
        return lastValidRoot
      }

      return undefined
    }
  }

  // Check if the root starts with the specified variable name
  if (isChainStartingWithVariable(lastValidRoot, variableNameList)) {
    return lastValidRoot
  }

  return undefined
}

const isChainStartingWithVariable = (
  node: CallExpression,
  variableNameList: string[],
): boolean => {
  // Traverse down to find the start of the chain
  let current: Node = node

  while (current) {
    if (current.getKind() === SyntaxKind.Identifier) {
      const identifier = current.asKindOrThrow(SyntaxKind.Identifier)
      return variableNameList.includes(identifier.getText())
    }

    if (current.getKind() === SyntaxKind.CallExpression) {
      const callExpr = current.asKindOrThrow(SyntaxKind.CallExpression)
      current = callExpr.getExpression()
    } else if (current.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = current.asKindOrThrow(
        SyntaxKind.PropertyAccessExpression,
      )
      current = propAccess.getExpression()
    } else {
      break
    }
  }

  return false
}

const refactorChain = (chainRoot: CallExpression): string | undefined => {
  const { chainWithoutLast, lastMethodName } =
    extractLastChainedMethod(chainRoot)

  const initialExpression = extractExpressionsWithoutNestedIf(chainWithoutLast)
  if (!initialExpression) {
    return undefined
  }

  const ifCalls = getDirectIfCallsInChain(chainWithoutLast)

  let newCode = ''

  // Add the initial query assignment
  newCode += `let query = ${initialExpression}\n\n`

  // Process each $if call
  for (const ifCall of ifCalls) {
    const condition = ifCall.getArguments()[0]?.getText() || ''
    const callback = ifCall.getArguments()[1]

    if (callback && callback.getKind() === SyntaxKind.ArrowFunction) {
      const arrowFunc = callback.asKindOrThrow(SyntaxKind.ArrowFunction)
      // Check if body contains nested $if calls
      const bodyNode = arrowFunc.getBody()
      if (bodyNode) {
        // Get the parameter name from the arrow function
        const parameterName = arrowFunc.getParameters()[0]?.getName()
        if (!parameterName) {
          throw new Error(`Could not find parameterName for .$if statement`)
        }

        // Look for nested $if calls in the AST
        const nestedIfCalls = getDirectIfCallsInChain(bodyNode)
        if (nestedIfCalls.length > 0) {
          // Handle nested $if calls
          newCode += `if (${condition}) {\n`

          // Get the expression before any nested $if calls
          const beforeNestedIf = extractExpressionsWithoutNestedIf(bodyNode)
          if (beforeNestedIf && beforeNestedIf.trim() !== parameterName) {
            const parameterRegex = new RegExp(`\\b${parameterName}\\b`, 'g')
            newCode += `  query = ${beforeNestedIf.replace(parameterRegex, 'query')}\n`
          }

          // Process each nested $if
          for (const nestedIfCall of nestedIfCalls) {
            const nestedCondition =
              nestedIfCall.getArguments()[0]?.getText() || ''
            const nestedCallback = nestedIfCall.getArguments()[1]

            if (
              nestedCallback &&
              nestedCallback.getKind() === SyntaxKind.ArrowFunction
            ) {
              const nestedArrowFunc = nestedCallback.asKindOrThrow(
                SyntaxKind.ArrowFunction,
              )
              const nestedBody = nestedArrowFunc.getBody()
              const nestedParameterName = nestedArrowFunc
                .getParameters()[0]
                ?.getName()
              if (!nestedParameterName) {
                throw new Error(
                  'Could not find nestedParameterName for $.if statement',
                )
              }

              if (nestedBody) {
                const nestedBodyText = nestedBody.getText()
                const nestedParameterRegex = new RegExp(
                  `\\b${nestedParameterName}\\b`,
                  'g',
                )
                const transformedBody = nestedBodyText.replace(
                  nestedParameterRegex,
                  'query',
                )

                newCode += `  if (${nestedCondition}) {\n`
                newCode += `    query = ${transformedBody}\n`
                newCode += `  }\n`
              }
            }
          }

          newCode += `}\n`
        } else {
          // Simple case without nested $if
          newCode += `if (${condition}) {\n`
          const parameterRegex = new RegExp(`\\b${parameterName}\\b`, 'g')
          const bodyText = bodyNode.getText()
          newCode += `  query = ${bodyText.replace(parameterRegex, 'query')}\n`
          newCode += `}\n`
        }
      }
    }
  }

  // Add the final part of the chain (after all $if calls)
  const finalPart = `.${lastMethodName}()`
  newCode += `return query${finalPart}`

  return newCode.trimEnd()
}

const extractExpressionsWithoutNestedIf = (bodyExpression: Node): string => {
  // If it's not a call expression, return the original text
  if (bodyExpression.getKind() !== SyntaxKind.CallExpression) {
    return bodyExpression.getText()
  }

  const callExpr = bodyExpression.asKindOrThrow(SyntaxKind.CallExpression)

  // Collect all the method calls in the chain (in reverse order)
  const methodCalls: Array<{ name: string; args: string }> = []
  let currentExpr: Node = callExpr
  let baseExpression = ''

  while (currentExpr && currentExpr.getKind() === SyntaxKind.CallExpression) {
    const current = currentExpr.asKindOrThrow(SyntaxKind.CallExpression)
    const expr = current.getExpression()

    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      const methodName = propAccess.getName()

      // Skip $if calls
      if (methodName !== '$if') {
        const args = current
          .getArguments()
          .map((arg) => arg.getText())
          .join(', ')
        methodCalls.unshift({ name: methodName, args })
      }

      currentExpr = propAccess.getExpression()
    } else {
      // This is the base expression (e.g., just 'db' or a function call)
      baseExpression = expr.getText()
      break
    }
  }

  // If we didn't find a base expression in the loop, use the current expression
  if (!baseExpression && currentExpr) {
    baseExpression = currentExpr.getText()
  }

  // Reconstruct the chain without $if calls
  let result = baseExpression
  for (const { name, args } of methodCalls) {
    result += `\n  .${name}(${args})`
  }

  return result
}

const getDirectIfCallsInChain = (chainRoot: Node): CallExpression[] => {
  const directIfCalls: CallExpression[] = []

  function traverseChain(node: Node) {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const callExpr = node as CallExpression

      if (isIfMethodCall(callExpr)) {
        directIfCalls.push(callExpr)
      }

      // Check the next chained method call
      const expression = callExpr.getExpression()
      if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propAccess = expression.asKindOrThrow(
          SyntaxKind.PropertyAccessExpression,
        )
        const object = propAccess.getExpression()
        traverseChain(object)
      }
    }
  }

  traverseChain(chainRoot)

  // Reverse to get them in the order they appear in the chain
  return directIfCalls.reverse()
}

type ExtractLastMethodResult = {
  chainWithoutLast: Node
  lastMethodName: string
}

const extractLastChainedMethod = (node: Node): ExtractLastMethodResult => {
  // Ensure we're working with a call expression
  if (node.getKind() !== SyntaxKind.CallExpression) {
    throw new Error('Node must be a CallExpression')
  }

  const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression)
  const expression = callExpr.getExpression()

  // Check if this is a method call (has property access)
  if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
    throw new Error('Not a method call chain')
  }

  const propAccess = expression.asKindOrThrow(
    SyntaxKind.PropertyAccessExpression,
  )
  const methodName = propAccess.getName()

  // Check if this is one of the allowed execute methods
  const allowedMethods = [
    'execute',
    'executeTakeFirst',
    'executeTakeFirstOrThrow',
  ]
  if (!allowedMethods.includes(methodName)) {
    throw new Error(
      `Last method must be one of: ${allowedMethods.join(', ')}. Got: ${methodName}`,
    )
  }

  // Get the expression before this method call (the rest of the chain)
  const chainWithoutLast = propAccess.getExpression()

  return {
    chainWithoutLast,
    lastMethodName: methodName,
  }
}

export {
  projectRoot,
  projectFiles,
  transformSourceFile,
  isIfMethodCall,
  findChainRoot,
  refactorChain,
  extractExpressionsWithoutNestedIf,
  getDirectIfCallsInChain,
  extractLastChainedMethod,
}
