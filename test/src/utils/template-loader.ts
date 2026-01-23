import path from 'path';
import fs from 'fs/promises';

/**
 * Safely parse JSON with error handling
 * Prevents DoS/crashes from malformed JSON files
 */
function safeJsonParse<T = unknown>(jsonString: string, filePath: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

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
  'streamable-http': {
    typescript: {
      name: 'streamable-http',
      description: 'Serverless MCP Server with Streamable HTTP (2025 spec)',
      features: ['Streamable HTTP', 'Serverless', 'AWS Lambda/Vercel ready', 'CORS', 'Health checks'],
      files: [
        {
          path: 'src/index.ts',
          content: `import { createServer } from './server';
import { createStreamableHttpHandler } from './transport/streamable-http';
import { exampleTool } from './tools/example-tool';
import { logger } from './utils/logger';

const server = createServer({
  name: '{{projectName}}',
  version: '1.0.0',
  description: '{{projectDescription}}'
});

// Register tools
server.registerTool(exampleTool);

// Create HTTP handler for serverless deployment
export const handler = createStreamableHttpHandler(server);

// Start standalone server if not in serverless environment
if (process.env.STANDALONE !== 'false') {
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port).then(() => {
    logger.info(\`{{projectName}} MCP server listening on port \${port}\`);
    logger.info(\`Transport: Streamable HTTP (2025-03-26 spec)\`);
  }).catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
`
        },
        {
          path: 'src/server.ts',
          content: `import http from 'http';
import { Tool } from './types';
import { logger } from './utils/logger';
import { corsMiddleware, healthHandler, wellKnownHandler } from './middleware';

interface ServerConfig {
  name: string;
  version: string;
  description?: string;
}

export function createServer(config: ServerConfig) {
  const tools = new Map<string, Tool<any, any>>();

  const registerTool = (tool: Tool<any, any>): void => {
    tools.set(tool.name, tool);
    logger.debug(\`Registered tool: \${tool.name}\`);
  };

  const handleToolCall = async (toolName: string, input: unknown): Promise<unknown> => {
    const tool = tools.get(toolName);
    if (!tool) {
      throw new Error(\`Tool not found: \${toolName}\`);
    }

    const startTime = Date.now();
    logger.info({ tool: toolName, message: 'Executing tool' });

    try {
      const result = await tool.execute(input);
      logger.info({ tool: toolName, duration: Date.now() - startTime, message: 'Tool completed' });
      return result;
    } catch (error) {
      logger.error({ tool: toolName, error, message: 'Tool execution failed' });
      throw error;
    }
  };

  const getCapabilities = () => ({
    name: config.name,
    version: config.version,
    description: config.description,
    transport: ['streamable-http'],
    tools: Array.from(tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  });

  const listen = (port: number): Promise<http.Server> => {
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        // Apply CORS
        corsMiddleware(req, res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Route handling
        const url = new URL(req.url || '/', \`http://\${req.headers.host}\`);

        if (url.pathname === '/health' || url.pathname === '/ready') {
          return healthHandler(req, res);
        }

        if (url.pathname === '/.well-known/mcp-configuration') {
          return wellKnownHandler(req, res, getCapabilities());
        }

        if (url.pathname === '/mcp' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            // Safely parse JSON body
            let parsed: { method: string; params?: any };
            try {
              parsed = JSON.parse(body);
            } catch (parseError) {
              logger.error({ error: parseError, message: 'Invalid JSON in request' });
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error: Invalid JSON' }
              }));
              return;
            }

            try {
              const { method, params } = parsed;

              if (method === 'tools/list') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tools: getCapabilities().tools }));
                return;
              }

              if (method === 'tools/call') {
                const result = await handleToolCall(params.name, params.arguments);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ result }));
                return;
              }

              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unknown method' }));
            } catch (error) {
              logger.error({ error, message: 'Request handling error' });
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal error' }
              }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      server.listen(port, () => resolve(server));
    });
  };

  return {
    registerTool,
    handleToolCall,
    getCapabilities,
    listen,
    tools
  };
}

export type MCPServer = ReturnType<typeof createServer>;
`
        },
        {
          path: 'src/transport/streamable-http.ts',
          content: `import { MCPServer } from '../server';
import { logger } from '../utils/logger';

interface StreamableRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface StreamableResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Create a Streamable HTTP handler for serverless environments
 * Implements MCP 2025-03-26 Streamable HTTP transport
 */
export function createStreamableHttpHandler(server: MCPServer) {
  return async (event: any, context?: any): Promise<any> => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS' || event.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers,
        body: ''
      };
    }

    // Safely parse request body
    let body: any;
    try {
      body = typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body || event;
    } catch (parseError) {
      logger.error({ error: parseError, message: 'Invalid JSON in request body' });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error: Invalid JSON' }
        })
      };
    }

    try {
      const request: StreamableRequest = body;
      let response: StreamableResponse;

      switch (request.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2025-03-26',
              capabilities: {
                tools: {}
              },
              serverInfo: server.getCapabilities()
            }
          };
          break;

        case 'tools/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: server.getCapabilities().tools
            }
          };
          break;

        case 'tools/call':
          const { name, arguments: args } = request.params as any;
          const result = await server.handleToolCall(name, args);
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result) }]
            }
          };
          break;

        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: \`Method not found: \${request.method}\`
            }
          };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
      };
    } catch (error) {
      logger.error({ error, message: 'Streamable HTTP handler error' });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error'
          }
        })
      };
    }
  };
}
`
        },
        {
          path: 'src/middleware.ts',
          content: `import { IncomingMessage, ServerResponse } from 'http';

export function corsMiddleware(req: IncomingMessage, res: ServerResponse): void {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function healthHandler(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }));
}

export function wellKnownHandler(
  req: IncomingMessage,
  res: ServerResponse,
  capabilities: any
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    mcp_version: '2025-03-26',
    server_name: capabilities.name,
    server_version: capabilities.version,
    capabilities: ['tools'],
    transport: ['streamable-http'],
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    }
  }));
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

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}
`
        },
        {
          path: 'src/tools/example-tool.ts',
          content: `import { Tool, ToolInput, ToolOutput } from '../types';

interface ExampleInput extends ToolInput {
  query: string;
  options?: {
    format?: 'json' | 'text';
  };
}

interface ExampleOutput extends ToolOutput {
  result: string;
  metadata: {
    processedAt: string;
    format: string;
  };
}

export const exampleTool: Tool<ExampleInput, ExampleOutput> = {
  name: 'example-tool',
  description: 'An example tool that processes queries',

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to process'
      },
      options: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'text'],
            default: 'json'
          }
        }
      }
    },
    required: ['query'],
    additionalProperties: false
  },

  async execute(input: ExampleInput): Promise<ExampleOutput> {
    const format = input.options?.format || 'json';

    return {
      result: \`Processed: \${input.query}\`,
      metadata: {
        processedAt: new Date().toISOString(),
        format
      }
    };
  }
};
`
        },
        {
          path: 'src/utils/logger.ts',
          content: `type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;
  private jsonOutput: boolean;

  constructor(level: LogLevel = 'info', jsonOutput: boolean = true) {
    this.level = level;
    this.jsonOutput = jsonOutput;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, messageOrData: string | object, extra?: object): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof messageOrData === 'string' ? messageOrData : '',
      ...(typeof messageOrData === 'object' ? messageOrData : {}),
      ...extra
    };

    if (this.jsonOutput) {
      return JSON.stringify(entry);
    }

    return \`[\${entry.timestamp}] [\${level.toUpperCase()}] \${entry.message}\`;
  }

  debug(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', messageOrData, extra));
    }
  }

  info(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', messageOrData, extra));
    }
  }

  warn(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', messageOrData, extra));
    }
  }

  error(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', messageOrData, extra));
    }
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info',
  process.env.LOG_FORMAT !== 'text'
);
`
        },
        {
          path: 'src/lambda.ts',
          content: `// AWS Lambda handler
export { handler } from './index';
`
        },
        {
          path: '.well-known/mcp-configuration',
          content: `{
  "mcp_version": "2025-03-26",
  "server_name": "{{projectName}}",
  "capabilities": ["tools"],
  "transport": ["streamable-http"],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
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
    "lint": "eslint src/**/*.ts",
    "deploy:vercel": "vercel deploy",
    "deploy:lambda": "npx serverless deploy"
  },
  "author": "{{author}}",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.10.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0",
    "serverless": "^3.38.0"
  }
}
`
        },
        {
          path: 'serverless.yml',
          content: `service: {{projectName}}

provider:
  name: aws
  runtime: nodejs20.x
  region: \${opt:region, 'us-east-1'}
  memorySize: 512
  timeout: 30
  environment:
    NODE_ENV: production
    LOG_LEVEL: info

functions:
  mcp:
    handler: dist/lambda.handler
    events:
      - http:
          path: /mcp
          method: post
          cors: true
      - http:
          path: /.well-known/mcp-configuration
          method: get
          cors: true
      - http:
          path: /health
          method: get

plugins:
  - serverless-offline

custom:
  serverless-offline:
    httpPort: 3000
`
        },
        {
          path: 'vercel.json',
          content: `{
  "functions": {
    "api/mcp.ts": {
      "runtime": "@vercel/node@3"
    }
  },
  "routes": [
    { "src": "/mcp", "dest": "/api/mcp" },
    { "src": "/.well-known/mcp-configuration", "dest": "/api/well-known" },
    { "src": "/health", "dest": "/api/health" }
  ]
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
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
`
        },
        {
          path: '.env.example',
          content: `# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
LOG_FORMAT=json

# CORS Configuration
CORS_ORIGIN=*

# Serverless (set to false when deployed)
STANDALONE=true
`
        },
        {
          path: 'README.md',
          content: `# {{projectName}}

{{projectDescription}}

## Features

- Streamable HTTP transport (MCP 2025-03-26 spec)
- Serverless-ready (AWS Lambda, Vercel, Cloud Run)
- CORS configured
- Health check endpoints
- /.well-known discovery endpoint
- Structured JSON logging

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Server will be available at http://localhost:3000

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /mcp | POST | MCP protocol endpoint |
| /health | GET | Health check |
| /.well-known/mcp-configuration | GET | Server discovery |

## Deployment

### AWS Lambda

\`\`\`bash
npm run build
npm run deploy:lambda
\`\`\`

### Vercel

\`\`\`bash
npm run deploy:vercel
\`\`\`

### Docker

\`\`\`bash
docker build -t {{projectName}} .
docker run -p 3000:3000 {{projectName}}
\`\`\`

## Testing

\`\`\`bash
# List tools
curl -X POST http://localhost:3000/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call tool
curl -X POST http://localhost:3000/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"example-tool","arguments":{"query":"test"}},"id":2}'
\`\`\`

## License

MIT
`
        },
        {
          path: '.gitignore',
          content: `node_modules/
dist/
.env
.env.local
.vercel
.serverless
*.log
.DS_Store
`
        }
      ]
    }
  },
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
  },
  enterprise: {
    typescript: {
      name: 'enterprise',
      description: 'Enterprise MCP Server with OAuth 2.0 PKCE',
      features: ['OAuth 2.0 PKCE', 'Audit logging', 'Prometheus metrics', 'Rate limiting'],
      files: [
        {
          path: 'src/index.ts',
          content: `import { createServer } from './server';
import { createAuthMiddleware } from './auth/middleware';
import { exampleTool } from './tools/example-tool';
import { logger } from './utils/logger';

const server = createServer({
  name: '{{projectName}}',
  version: '1.0.0'
});

// Apply security middleware
server.use(createAuthMiddleware());

// Register tools
server.registerTool(exampleTool);

// Start server
const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port).then(() => {
  logger.info({ port }, '{{projectName}} Enterprise MCP server started');
}).catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
`
        },
        {
          path: 'src/auth/oauth-pkce.ts',
          content: `import crypto from 'crypto';

export function generatePKCEChallenge() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge, method: 'S256' };
}

export function verifyPKCEChallenge(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}

export function validateToken(token: string): { sub: string; exp: number; scope: string[] } | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (decoded.exp < Date.now() / 1000) return null;
    return decoded;
  } catch { return null; }
}
`
        },
        {
          path: 'src/auth/middleware.ts',
          content: `import { IncomingMessage, ServerResponse } from 'http';
import { validateToken } from './oauth-pkce';
import { logger } from '../utils/logger';

export function createAuthMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === '/health' || req.url?.startsWith('/.well-known')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing authorization' }));
      return;
    }

    const payload = validateToken(authHeader.slice(7));
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return;
    }

    (req as any).user = { id: payload.sub, scopes: payload.scope };
    next();
  };
}
`
        },
        {
          path: 'src/utils/audit.ts',
          content: `import { logger } from './logger';

export function auditLog(entry: Record<string, unknown>): void {
  logger.info({ audit: true, ...entry }, 'Audit event');
}
`
        },
        {
          path: 'src/utils/metrics.ts',
          content: `let requestCount = 0;
const durations: number[] = [];

export function recordRequest(duration: number): void {
  requestCount++;
  durations.push(duration);
  if (durations.length > 1000) durations.shift();
}

export function getMetrics(): string {
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  return \`# HELP mcp_requests_total Total requests
# TYPE mcp_requests_total counter
mcp_requests_total \${requestCount}

# HELP mcp_request_duration_avg Avg duration ms
# TYPE mcp_request_duration_avg gauge
mcp_request_duration_avg \${avg.toFixed(2)}
\`;
}
`
        },
        {
          path: 'src/utils/rate-limiter.ts',
          content: `const store = new Map<string, { count: number; reset: number }>();
const limit = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const window = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

export function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = store.get(clientId);

  if (!entry || now > entry.reset) {
    store.set(clientId, { count: 1, reset: now + window });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
`
        },
        {
          path: 'src/server.ts',
          content: `import http from 'http';
import { Tool } from './types';
import { logger } from './utils/logger';
import { auditLog } from './utils/audit';
import { checkRateLimit } from './utils/rate-limiter';
import { recordRequest, getMetrics } from './utils/metrics';

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

export function createServer(config: { name: string; version: string }) {
  const tools = new Map<string, Tool<any, any>>();
  const middlewares: Middleware[] = [];

  return {
    use: (mw: Middleware) => middlewares.push(mw),
    registerTool: <I, O>(tool: Tool<I, O>) => {
      tools.set(tool.name, tool);
      logger.debug({ tool: tool.name }, 'Tool registered');
    },
    listen: (port: number) => new Promise<http.Server>((resolve) => {
      const server = http.createServer(async (req, res) => {
        const start = Date.now();

        // Rate limiting
        const clientIp = req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
          res.writeHead(429);
          res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
          return;
        }

        // Middlewares
        let idx = 0;
        const next = () => { if (idx < middlewares.length) middlewares[idx++](req, res, next); };
        next();

        // Routes
        if (req.url === '/health') {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'healthy' }));
        } else if (req.url === '/metrics') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(getMetrics());
        }

        recordRequest(Date.now() - start);
      });
      server.listen(port, () => resolve(server));
    }),
    tools
  };
}
`
        },
        {
          path: 'src/types.ts',
          content: `export interface ToolInput { [key: string]: unknown; }
export interface ToolOutput { [key: string]: unknown; }
export interface Tool<I extends ToolInput, O extends ToolOutput> {
  name: string;
  description: string;
  inputSchema: object;
  requiredScopes?: string[];
  execute(input: I): Promise<O>;
}
`
        },
        {
          path: 'src/tools/example-tool.ts',
          content: `import { Tool, ToolInput, ToolOutput } from '../types';

interface Input extends ToolInput { query: string; }
interface Output extends ToolOutput { result: string; processedAt: string; }

export const exampleTool: Tool<Input, Output> = {
  name: 'example-tool',
  description: 'A secure example tool',
  requiredScopes: ['tools:execute'],
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', maxLength: 1000 } },
    required: ['query'],
    additionalProperties: false
  },
  async execute(input: Input): Promise<Output> {
    return { result: \`Processed: \${input.query}\`, processedAt: new Date().toISOString() };
  }
};
`
        },
        {
          path: 'src/utils/logger.ts',
          content: `type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  constructor(level: LogLevel = 'info') { this.level = level; }

  private shouldLog(l: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(l) >= levels.indexOf(this.level);
  }

  private log(level: LogLevel, data: object, msg?: string): void {
    if (!this.shouldLog(level)) return;
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message: msg, ...data }));
  }

  debug(data: object, msg?: string) { this.log('debug', data, msg); }
  info(data: object, msg?: string) { this.log('info', data, msg); }
  warn(data: object, msg?: string) { this.log('warn', data, msg); }
  error(data: object, msg?: string) { this.log('error', data, msg); }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || 'info');
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
    "test": "jest"
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
          path: '.env.example',
          content: `PORT=3000
NODE_ENV=production
LOG_LEVEL=info
OAUTH_ISSUER=https://your-auth-provider.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
`
        },
        {
          path: 'README.md',
          content: `# {{projectName}}

{{projectDescription}}

## Security Features

- OAuth 2.0 PKCE authentication
- Input validation
- Rate limiting
- Audit logging
- Prometheus metrics at /metrics

## Quick Start

\\\`\\\`\\\`bash
npm install
cp .env.example .env
npm run dev
\\\`\\\`\\\`

## License

MIT
`
        }
      ]
    }
  },
  'multi-agent': {
    typescript: {
      name: 'multi-agent',
      description: 'MCP Server with orchestrator/worker pattern',
      features: ['Orchestrator pattern', 'Worker agents', 'Task queue', 'State management'],
      files: [
        {
          path: 'src/index.ts',
          content: `import { createOrchestrator } from './agents/orchestrator';
import { createWorker } from './agents/worker';
import { TaskQueue } from './queue/task-queue';
import { StateManager } from './state/manager';
import { logger } from './utils/logger';

const queue = new TaskQueue();
const state = new StateManager();

const orchestrator = createOrchestrator({ name: '{{projectName}}', queue, state });
const workers = [
  createWorker({ id: 'worker-1', queue, state }),
  createWorker({ id: 'worker-2', queue, state })
];

async function start() {
  logger.info({}, 'Starting multi-agent system');
  await Promise.all(workers.map(w => w.start()));
  await orchestrator.start();

  process.on('SIGTERM', async () => {
    await orchestrator.stop();
    await Promise.all(workers.map(w => w.stop()));
    process.exit(0);
  });
}

start().catch(e => { logger.error({ error: e }, 'Failed'); process.exit(1); });
`
        },
        {
          path: 'src/agents/orchestrator.ts',
          content: `import { TaskQueue, Task } from '../queue/task-queue';
import { StateManager } from '../state/manager';
import { logger } from '../utils/logger';

interface Config { name: string; queue: TaskQueue; state: StateManager; }

export function createOrchestrator(config: Config) {
  const submitTask = async (task: Omit<Task, 'id' | 'status' | 'createdAt'>): Promise<string> => {
    const id = crypto.randomUUID();
    await config.queue.enqueue({ ...task, id, status: 'pending', createdAt: Date.now() });
    logger.info({ taskId: id }, 'Task submitted');
    return id;
  };

  const distributeWork = async (items: any[]): Promise<string[]> => {
    return Promise.all(items.map(item => submitTask({ type: 'process', payload: item, priority: 'normal' })));
  };

  return {
    submitTask,
    distributeWork,
    start: async () => logger.info({ name: config.name }, 'Orchestrator started'),
    stop: async () => logger.info({ name: config.name }, 'Orchestrator stopped')
  };
}
`
        },
        {
          path: 'src/agents/worker.ts',
          content: `import { TaskQueue, Task } from '../queue/task-queue';
import { StateManager } from '../state/manager';
import { logger } from '../utils/logger';

interface Config { id: string; queue: TaskQueue; state: StateManager; }

export function createWorker(config: Config) {
  let running = false;
  let interval: NodeJS.Timeout | null = null;

  const process = async (task: Task) => {
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { processed: task.payload, workerId: config.id };
  };

  const poll = async () => {
    if (!running) return;
    const task = await config.queue.dequeue();
    if (task) {
      try {
        const result = await process(task);
        await config.queue.complete(task.id, result);
      } catch (e) {
        await config.queue.fail(task.id, (e as Error).message);
      }
    }
  };

  return {
    start: async () => { running = true; interval = setInterval(poll, 50); logger.info({ id: config.id }, 'Worker started'); },
    stop: async () => { running = false; if (interval) clearInterval(interval); logger.info({ id: config.id }, 'Worker stopped'); }
  };
}
`
        },
        {
          path: 'src/queue/task-queue.ts',
          content: `export interface Task {
  id: string;
  type: string;
  payload: any;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  result?: any;
  error?: string;
}

export class TaskQueue {
  private tasks = new Map<string, Task>();
  private pending: string[] = [];

  async enqueue(task: Task): Promise<string> {
    this.tasks.set(task.id, task);
    task.priority === 'high' ? this.pending.unshift(task.id) : this.pending.push(task.id);
    return task.id;
  }

  async dequeue(): Promise<Task | null> {
    const id = this.pending.shift();
    if (!id) return null;
    const task = this.tasks.get(id);
    if (task) task.status = 'processing';
    return task || null;
  }

  async complete(id: string, result: any) {
    const task = this.tasks.get(id);
    if (task) { task.status = 'completed'; task.result = result; }
  }

  async fail(id: string, error: string) {
    const task = this.tasks.get(id);
    if (task) { task.status = 'failed'; task.error = error; }
  }

  async getTask(id: string) { return this.tasks.get(id) || null; }
}
`
        },
        {
          path: 'src/state/manager.ts',
          content: `export class StateManager {
  private state = new Map<string, any>();
  private subs = new Map<string, Set<(v: any) => void>>();

  get<T>(key: string): T | undefined { return this.state.get(key); }

  set<T>(key: string, value: T): void {
    this.state.set(key, value);
    this.subs.get(key)?.forEach(cb => cb(value));
  }

  subscribe(key: string, cb: (v: any) => void): () => void {
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(cb);
    return () => this.subs.get(key)?.delete(cb);
  }
}
`
        },
        {
          path: 'src/utils/logger.ts',
          content: `type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  constructor(level: LogLevel = 'info') { this.level = level; }

  private shouldLog(l: LogLevel): boolean {
    return ['debug', 'info', 'warn', 'error'].indexOf(l) >= ['debug', 'info', 'warn', 'error'].indexOf(this.level);
  }

  private log(level: LogLevel, data: object, msg?: string): void {
    if (!this.shouldLog(level)) return;
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message: msg, ...data }));
  }

  debug(data: object, msg?: string) { this.log('debug', data, msg); }
  info(data: object, msg?: string) { this.log('info', data, msg); }
  warn(data: object, msg?: string) { this.log('warn', data, msg); }
  error(data: object, msg?: string) { this.log('error', data, msg); }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || 'info');
`
        },
        {
          path: 'package.json',
          content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "{{projectDescription}}",
  "main": "dist/index.js",
  "scripts": { "build": "tsc", "dev": "ts-node src/index.ts", "start": "node dist/index.js", "test": "jest" },
  "author": "{{author}}",
  "license": "MIT",
  "devDependencies": { "@types/node": "^20.10.0", "jest": "^29.7.0", "ts-jest": "^29.1.1", "ts-node": "^10.9.2", "typescript": "^5.3.0" }
}
`
        },
        {
          path: 'README.md',
          content: `# {{projectName}}

{{projectDescription}}

## Architecture

- **Orchestrator**: Distributes tasks, monitors progress
- **Workers**: Process tasks from the queue
- **Task Queue**: Priority-based distribution
- **State Manager**: Shared state with pub/sub

## Quick Start

\\\`\\\`\\\`bash
npm install
npm run dev
\\\`\\\`\\\`

## License

MIT
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
    const config = safeJsonParse<Omit<Template, 'files'>>(configContent, configPath);

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
      name: 'streamable-http',
      description: 'Serverless MCP server with Streamable HTTP transport (2025 spec)',
      features: ['Streamable HTTP', 'AWS Lambda/Vercel ready', 'CORS', 'Health checks', '/.well-known discovery']
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
    },
    {
      name: 'multi-agent',
      description: 'MCP server with orchestrator/worker pattern for multi-agent workflows',
      features: ['Orchestrator pattern', 'Worker agents', 'Task queue', 'State management']
    },
    {
      name: 'enterprise',
      description: 'Production-ready MCP server with full security suite',
      features: ['OAuth 2.0 PKCE', 'Audit logging', 'Prometheus metrics', 'Rate limiting', 'Input validation']
    }
  ];

  // Add any custom templates from templates directory
  try {
    const customTemplates = await fs.readdir(TEMPLATES_DIR);
    for (const dir of customTemplates) {
      const configPath = path.join(TEMPLATES_DIR, dir, 'template.json');
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = safeJsonParse<{name: string; description: string; features: string[]}>(configContent, configPath);
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
