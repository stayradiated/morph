import * as path from 'node:path'
import { Project } from 'ts-morph'
import * as transform from './transforms/kysely-if-statements.ts'

const project = new Project({
  tsConfigFilePath: path.join(transform.projectRoot, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
})

project.addSourceFilesAtPaths(
  transform.projectFiles.map((glob) => {
    if (glob.startsWith('!') || glob.startsWith('/')) {
      return glob
    }

    return path.join(transform.projectRoot, glob)
  }),
)

for (const sourceFile of project.getSourceFiles()) {
  console.log(
    `\n• ${path.relative(transform.projectRoot, sourceFile.getFilePath())}`,
  )

  transform.transformSourceFile(sourceFile)
}

project.save()
