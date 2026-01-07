import path from 'path';
import fs from 'fs/promises';

interface TemplateFile {
  path: string;
  content: string;
}

interface Template {
  name: string;
  description: string;
  features: string[];
  files: TemplateFile[];
}

interface TemplateInfo {
  name: string;
  description: string;
  features: string[];
}

const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// Built-in templates
const builtInTemplates: Record<string, Record<string, Template>> = {
  basic: {
    typescript: {
      name: 'basic',
      description: 'Basic MCP Server',
      features: ['TypeScript', 'Example tool', 'Logging', 'Tests'],
      files: [
        {
          path: 'src/index.ts',
          content: `import { MCPServer } from './server';
import { exampleTool } from './tools/example-tool';
import { logger } from './utils/logger';

const server = new MCPServer({
  name: '{{projectName}}',
  version: '1.0.0'
});

// Register tools
server.registerTool(exampleTool);

// Start server
server.start().then(() => {
  logger.info('{{projectName}} MCP server started');
}).catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
`
        },
        {
          path: 'src/server.ts',
          content: `import { Tool } from './types';
import { logger } from './utils/logger';

interface ServerConfig {
  name: string;
  version: string;
}

export class MCPServer {
  private config: ServerConfig;
  private tools: Map<string, Tool<any, any>> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
  }

  registerTool<I, O>(tool: Tool<I, O>): void {
    this.tools.set(tool.name, tool);
    logger.debug(\`Registered tool: \${tool.name}\`);
  }

  async handleToolCall(toolName: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(\`Tool not found: \${toolName}\`);
    }

    logger.info(\`Executing tool: \${toolName}\`);
    const result = await tool.execute(input);
    logger.info(\`Tool \${toolName} completed\`);

    return result;
  }

  async start(): Promise<void> {
    logger.info(\`Starting \${this.config.name} v\${this.config.version}\`);
    logger.info(\`Registered tools: \${Array.from(this.tools.keys()).join(', ')}\`);
    // Add your server initialization logic here
  }

  getToolList(): string[] {
    return Array.from(this.tools.keys());
  }
}
`
        },
        {
          path: 'src/types.ts',
          content: `export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  [key: string]: unknown;
}

export interface Tool<I extends ToolInput, O extends ToolOutput> {
  name: string;
  description: string;
  inputSchema: object;
  execute(input: I): Promise<O>;
}
`
        },
        {
          path: 'src/tools/example-tool.ts',
          content: `import { Tool, ToolInput, ToolOutput } from '../types';

interface ExampleInput extends ToolInput {
  input: string;
}

interface ExampleOutput extends ToolOutput {
  result: string;
  processedAt: string;
}

export const exampleTool: Tool<ExampleInput, ExampleOutput> = {
  name: 'example-tool',
  description: 'An example tool that processes input',

  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'The input to process'
      }
    },
    required: ['input']
  },

  async execute(input: ExampleInput): Promise<ExampleOutput> {
    // TODO: Implement your tool logic here
    return {
      result: \`Processed: \${input.input}\`,
      processedAt: new Date().toISOString()
    };
  }
};
`
        },
        {
          path: 'src/utils/logger.ts',
          content: `type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
    return \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\${formattedArgs}\`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
`
        },
        {
          path: 'tests/tools/example-tool.test.ts',
          content: `import { exampleTool } from '../../src/tools/example-tool';

describe('Example Tool', () => {
  it('should process input correctly', async () => {
    const input = { input: 'test value' };
    const result = await exampleTool.execute(input);

    expect(result.result).toBe('Processed: test value');
    expect(result.processedAt).toBeDefined();
  });

  it('should handle empty input', async () => {
    const input = { input: '' };
    const result = await exampleTool.execute(input);

    expect(result.result).toBe('Processed: ');
  });
});
`
        },
        {
          path: 'package.json',
          content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "{{projectDescription}}",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  },
  "author": "{{author}}",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.10.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0"
  }
}
`
        },
        {
          path: 'tsconfig.json',
          content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
`
        },
        {
          path: '.env.example',
          content: `# Environment Configuration
NODE_ENV=development
LOG_LEVEL=info

# Add your API keys and secrets here
# API_KEY=your-api-key
`
        },
        {
          path: 'README.md',
          content: `# {{projectName}}

{{projectDescription}}

## Installation

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## Project Structure

\`\`\`
{{projectName}}/
├── src/
│   ├── index.ts          # Server entry point
│   ├── server.ts         # MCP server implementation
│   ├── types.ts          # Type definitions
│   ├── tools/            # Tool implementations
│   │   └── example-tool.ts
│   └── utils/            # Utility functions
│       └── logger.ts
├── tests/                # Test files
├── mcp-spec.json         # MCP specification
└── package.json
\`\`\`

## Adding New Tools

1. Create a new file in \`src/tools/\`
2. Implement the \`Tool\` interface
3. Register the tool in \`src/index.ts\`

## License

MIT
`
        },
        {
          path: '.gitignore',
          content: `# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# Logs
*.log

# OS
.DS_Store
Thumbs.db
`
        }
      ]
    },
    python: {
      name: 'basic',
      description: 'Basic MCP Server (Python)',
      features: ['Python', 'Example tool', 'Logging', 'Tests'],
      files: [
        {
          path: 'src/__init__.py',
          content: ''
        },
        {
          path: 'src/main.py',
          content: `from src.server import MCPServer
from src.tools.example_tool import example_tool
from src.utils.logger import logger

def main():
    server = MCPServer(
        name="{{projectName}}",
        version="1.0.0"
    )

    # Register tools
    server.register_tool(example_tool)

    # Start server
    try:
        server.start()
        logger.info("{{projectName}} MCP server started")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise

if __name__ == "__main__":
    main()
`
        },
        {
          path: 'src/server.py',
          content: `from typing import Dict, Any, Callable
from src.utils.logger import logger

class MCPServer:
    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self.tools: Dict[str, Dict[str, Any]] = {}

    def register_tool(self, tool: Dict[str, Any]) -> None:
        self.tools[tool["name"]] = tool
        logger.debug(f"Registered tool: {tool['name']}")

    async def handle_tool_call(self, tool_name: str, input_data: Any) -> Any:
        tool = self.tools.get(tool_name)
        if not tool:
            raise ValueError(f"Tool not found: {tool_name}")

        logger.info(f"Executing tool: {tool_name}")
        result = await tool["execute"](input_data)
        logger.info(f"Tool {tool_name} completed")

        return result

    def start(self) -> None:
        logger.info(f"Starting {self.name} v{self.version}")
        logger.info(f"Registered tools: {', '.join(self.tools.keys())}")
        # Add your server initialization logic here

    def get_tool_list(self) -> list:
        return list(self.tools.keys())
`
        },
        {
          path: 'src/tools/__init__.py',
          content: ''
        },
        {
          path: 'src/tools/example_tool.py',
          content: `from datetime import datetime
from typing import TypedDict

class ExampleInput(TypedDict):
    input: str

class ExampleOutput(TypedDict):
    result: str
    processed_at: str

async def execute(input_data: ExampleInput) -> ExampleOutput:
    """Process the input and return a result."""
    # TODO: Implement your tool logic here
    return {
        "result": f"Processed: {input_data['input']}",
        "processed_at": datetime.now().isoformat()
    }

example_tool = {
    "name": "example-tool",
    "description": "An example tool that processes input",
    "input_schema": {
        "type": "object",
        "properties": {
            "input": {
                "type": "string",
                "description": "The input to process"
            }
        },
        "required": ["input"]
    },
    "execute": execute
}
`
        },
        {
          path: 'src/utils/__init__.py',
          content: ''
        },
        {
          path: 'src/utils/logger.py',
          content: `import logging
import os
from datetime import datetime

class Logger:
    def __init__(self, level: str = "INFO"):
        self.logger = logging.getLogger("mcp-server")
        self.logger.setLevel(getattr(logging, level.upper()))

        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S"
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)

    def debug(self, message: str, *args) -> None:
        self.logger.debug(message, *args)

    def info(self, message: str, *args) -> None:
        self.logger.info(message, *args)

    def warn(self, message: str, *args) -> None:
        self.logger.warning(message, *args)

    def error(self, message: str, *args) -> None:
        self.logger.error(message, *args)

logger = Logger(os.getenv("LOG_LEVEL", "INFO"))
`
        },
        {
          path: 'tests/__init__.py',
          content: ''
        },
        {
          path: 'tests/test_example_tool.py',
          content: `import pytest
from src.tools.example_tool import execute

@pytest.mark.asyncio
async def test_process_input():
    input_data = {"input": "test value"}
    result = await execute(input_data)

    assert result["result"] == "Processed: test value"
    assert "processed_at" in result

@pytest.mark.asyncio
async def test_empty_input():
    input_data = {"input": ""}
    result = await execute(input_data)

    assert result["result"] == "Processed: "
`
        },
        {
          path: 'requirements.txt',
          content: `# Core dependencies
# Add your dependencies here

# Development
pytest>=7.4.0
pytest-asyncio>=0.21.0
`
        },
        {
          path: 'README.md',
          content: `# {{projectName}}

{{projectDescription}}

## Installation

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Development

\`\`\`bash
python -m src.main
\`\`\`

## Testing

\`\`\`bash
pytest
\`\`\`

## Project Structure

\`\`\`
{{projectName}}/
├── src/
│   ├── main.py           # Server entry point
│   ├── server.py         # MCP server implementation
│   ├── tools/            # Tool implementations
│   │   └── example_tool.py
│   └── utils/            # Utility functions
│       └── logger.py
├── tests/                # Test files
├── mcp-spec.json         # MCP specification
└── requirements.txt
\`\`\`

## Adding New Tools

1. Create a new file in \`src/tools/\`
2. Define your tool with name, description, input_schema, and execute function
3. Register the tool in \`src/main.py\`

## License

MIT
`
        },
        {
          path: '.gitignore',
          content: `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
.env

# IDE
.vscode/
.idea/

# Logs
*.log

# OS
.DS_Store
Thumbs.db
`
        }
      ]
    }
  }
};

export async function loadTemplate(templateName: string, language: 'typescript' | 'python'): Promise<Template> {
  // Check built-in templates first
  const builtIn = builtInTemplates[templateName]?.[language];
  if (builtIn) {
    return builtIn;
  }

  // Try to load from templates directory
  try {
    const templatePath = path.join(TEMPLATES_DIR, templateName, language);
    const configPath = path.join(templatePath, 'template.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    const filesDir = path.join(templatePath, 'files');
    const filesList = await fs.readdir(filesDir, { recursive: true });

    const files: TemplateFile[] = [];
    for (const file of filesList) {
      const filePath = path.join(filesDir, file as string);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          path: file as string,
          content
        });
      }
    }

    return {
      ...config,
      files
    };
  } catch {
    throw new Error(`Template '${templateName}' not found for language '${language}'`);
  }
}

export async function getAvailableTemplates(): Promise<TemplateInfo[]> {
  const templates: TemplateInfo[] = [
    {
      name: 'basic',
      description: 'Basic MCP server with one example tool',
      features: ['TypeScript/Python', 'Example tool', 'Logging', 'Test harness']
    },
    {
      name: 'discord-bot',
      description: 'MCP server with Discord bot integration',
      features: ['TypeScript/Python', 'Discord.js/discord.py', 'Event handlers', 'Slash commands']
    },
    {
      name: 'api-wrapper',
      description: 'MCP server that wraps an external API',
      features: ['TypeScript/Python', 'HTTP client', 'Rate limiting', 'Caching']
    }
  ];

  // Add any custom templates from templates directory
  try {
    const customTemplates = await fs.readdir(TEMPLATES_DIR);
    for (const dir of customTemplates) {
      const configPath = path.join(TEMPLATES_DIR, dir, 'template.json');
      try {
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        if (!templates.find(t => t.name === config.name)) {
          templates.push({
            name: config.name,
            description: config.description,
            features: config.features
          });
        }
      } catch {
        // Skip directories without valid config
      }
    }
  } catch {
    // Templates directory doesn't exist, use only built-in
  }

  return templates;
}
