import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';

interface ToolConfig {
  name: string;
  description: string;
  inputs: object | null;
}

const toolTemplate = `import { Tool, ToolInput, ToolOutput } from '../types';

interface {{pascalName}}Input extends ToolInput {
{{#each inputProperties}}
  {{name}}: {{type}};
{{/each}}
}

interface {{pascalName}}Output extends ToolOutput {
  result: unknown;
  processedAt: string;
}

export const {{camelName}}: Tool<{{pascalName}}Input, {{pascalName}}Output> = {
  name: '{{name}}',
  description: '{{description}}',

  inputSchema: {{{inputSchemaJson}}},

  async execute(input: {{pascalName}}Input): Promise<{{pascalName}}Output> {
    // TODO: Implement your tool logic here
    return {
      result: input,
      processedAt: new Date().toISOString()
    };
  }
};
`;

const testTemplate = `import { {{camelName}} } from '../../src/tools/{{name}}';

describe('{{pascalName}}', () => {
  it('should execute successfully', async () => {
    const input = {
{{#each inputProperties}}
      {{name}}: {{defaultValue}},
{{/each}}
    };

    const result = await {{camelName}}.execute(input);

    expect(result.processedAt).toBeDefined();
    expect(result.result).toBeDefined();
  });
});
`;

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function getTypeScriptType(jsonType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    object: 'object',
    array: 'unknown[]'
  };
  return typeMap[jsonType] || 'unknown';
}

function getDefaultValue(jsonType: string): string {
  const defaultMap: Record<string, string> = {
    string: "'test'",
    number: '0',
    integer: '0',
    boolean: 'true',
    object: '{}',
    array: '[]'
  };
  return defaultMap[jsonType] || 'null';
}

export async function addTool(projectPath: string, config: ToolConfig): Promise<void> {
  const toolsDir = path.join(projectPath, 'src', 'tools');
  const testsDir = path.join(projectPath, 'tests', 'tools');

  // Ensure directories exist
  await fs.mkdir(toolsDir, { recursive: true });
  await fs.mkdir(testsDir, { recursive: true });

  // Parse input schema
  const inputSchema = config.inputs || {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input parameter' }
    },
    required: ['input']
  };

  const properties = (inputSchema as any).properties || {};
  const inputProperties = Object.entries(properties).map(([name, prop]: [string, any]) => ({
    name,
    type: getTypeScriptType(prop.type),
    defaultValue: getDefaultValue(prop.type)
  }));

  const templateData = {
    name: config.name,
    pascalName: toPascalCase(config.name),
    camelName: toCamelCase(config.name),
    description: config.description,
    inputSchemaJson: JSON.stringify(inputSchema, null, 2),
    inputProperties
  };

  // Generate tool file
  const compiledTool = Handlebars.compile(toolTemplate);
  const toolContent = compiledTool(templateData);
  await fs.writeFile(
    path.join(toolsDir, `${config.name}.ts`),
    toolContent,
    'utf-8'
  );

  // Generate test file
  const compiledTest = Handlebars.compile(testTemplate);
  const testContent = compiledTest(templateData);
  await fs.writeFile(
    path.join(testsDir, `${config.name}.test.ts`),
    testContent,
    'utf-8'
  );

  // Update tool registry (if index.ts exists)
  const indexPath = path.join(toolsDir, 'index.ts');
  try {
    let indexContent = await fs.readFile(indexPath, 'utf-8');

    // Add import
    const importStatement = `import { ${toCamelCase(config.name)} } from './${config.name}';\n`;
    if (!indexContent.includes(importStatement)) {
      indexContent = importStatement + indexContent;
    }

    // Add to exports if there's an export statement
    if (indexContent.includes('export {')) {
      indexContent = indexContent.replace(
        /export \{([^}]*)\}/,
        (match, exports) => {
          if (!exports.includes(toCamelCase(config.name))) {
            return `export {${exports}, ${toCamelCase(config.name)} }`;
          }
          return match;
        }
      );
    }

    await fs.writeFile(indexPath, indexContent, 'utf-8');
  } catch {
    // Index file doesn't exist, create a simple one
    const indexContent = `export { ${toCamelCase(config.name)} } from './${config.name}';\n`;
    await fs.writeFile(indexPath, indexContent, 'utf-8');
  }
}
