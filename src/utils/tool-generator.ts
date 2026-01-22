import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';

interface ToolConfig {
  name: string;
  description: string;
  inputs: object | null;
}

type ProjectLanguage = 'typescript' | 'python';

// TypeScript template
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

// Python templates
const pythonToolTemplate = `"""{{description}}"""
from datetime import datetime
from typing import TypedDict, Any, Optional

class {{pascalName}}Input(TypedDict):
{{#each inputProperties}}
    {{snakeName}}: {{pythonType}}
{{/each}}

class {{pascalName}}Output(TypedDict):
    result: Any
    processed_at: str

async def execute(input_data: {{pascalName}}Input) -> {{pascalName}}Output:
    """{{description}}"""
    # TODO: Implement your tool logic here
    return {
        "result": input_data,
        "processed_at": datetime.now().isoformat()
    }

{{snakeName}}_tool = {
    "name": "{{name}}",
    "description": "{{description}}",
    "input_schema": {{{inputSchemaJson}}},
    "execute": execute
}
`;

const pythonTestTemplate = `import pytest
from src.tools.{{snakeName}} import execute

@pytest.mark.asyncio
async def test_{{snakeName}}_executes_successfully():
    input_data = {
{{#each inputProperties}}
        "{{snakeName}}": {{pythonDefaultValue}},
{{/each}}
    }

    result = await execute(input_data)

    assert "processed_at" in result
    assert "result" in result
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

function toSnakeCase(str: string): string {
  return str.replace(/-/g, '_');
}

function getPythonType(jsonType: string): string {
  const typeMap: Record<string, string> = {
    string: 'str',
    number: 'float',
    integer: 'int',
    boolean: 'bool',
    object: 'dict',
    array: 'list'
  };
  return typeMap[jsonType] || 'Any';
}

function getPythonDefaultValue(jsonType: string): string {
  const defaultMap: Record<string, string> = {
    string: '"test"',
    number: '0.0',
    integer: '0',
    boolean: 'True',
    object: '{}',
    array: '[]'
  };
  return defaultMap[jsonType] || 'None';
}

async function detectProjectLanguage(projectPath: string): Promise<ProjectLanguage> {
  try {
    // Check for package.json (TypeScript/Node)
    await fs.access(path.join(projectPath, 'package.json'));
    return 'typescript';
  } catch {
    try {
      // Check for requirements.txt or pyproject.toml (Python)
      await fs.access(path.join(projectPath, 'requirements.txt'));
      return 'python';
    } catch {
      try {
        await fs.access(path.join(projectPath, 'pyproject.toml'));
        return 'python';
      } catch {
        // Default to TypeScript
        return 'typescript';
      }
    }
  }
}

export async function addTool(projectPath: string, config: ToolConfig): Promise<void> {
  // Detect project language
  const language = await detectProjectLanguage(projectPath);

  if (language === 'python') {
    return addPythonTool(projectPath, config);
  }
  return addTypeScriptTool(projectPath, config);
}

async function addPythonTool(projectPath: string, config: ToolConfig): Promise<void> {
  const toolsDir = path.join(projectPath, 'src', 'tools');
  const testsDir = path.join(projectPath, 'tests');

  await fs.mkdir(toolsDir, { recursive: true });
  await fs.mkdir(testsDir, { recursive: true });

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
    snakeName: toSnakeCase(name),
    pythonType: getPythonType(prop.type),
    pythonDefaultValue: getPythonDefaultValue(prop.type)
  }));

  const snakeName = toSnakeCase(config.name);
  const templateData = {
    name: config.name,
    snakeName,
    pascalName: toPascalCase(config.name),
    description: config.description,
    inputSchemaJson: JSON.stringify(inputSchema, null, 4).replace(/\n/g, '\n    '),
    inputProperties
  };

  // Generate tool file
  const compiledTool = Handlebars.compile(pythonToolTemplate);
  await fs.writeFile(
    path.join(toolsDir, `${snakeName}.py`),
    compiledTool(templateData),
    'utf-8'
  );

  // Generate test file
  const compiledTest = Handlebars.compile(pythonTestTemplate);
  await fs.writeFile(
    path.join(testsDir, `test_${snakeName}.py`),
    compiledTest(templateData),
    'utf-8'
  );

  // Ensure __init__.py exists
  const initPath = path.join(toolsDir, '__init__.py');
  try {
    await fs.access(initPath);
  } catch {
    await fs.writeFile(initPath, '', 'utf-8');
  }
}

async function addTypeScriptTool(projectPath: string, config: ToolConfig): Promise<void> {
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
