/**
 * Documentation Generator
 * Auto-generates professional documentation for MCP servers
 */

import fs from 'fs/promises';
import path from 'path';

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
      default?: unknown;
      enum?: unknown[];
    }>;
    required?: string[];
  };
}

interface MCPSpec {
  name: string;
  version: string;
  description: string;
  tools: ToolInfo[];
  permissions?: string[];
}

interface EnvVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

interface DocGeneratorConfig {
  projectPath: string;
  outputDir?: string;
  includeApi?: boolean;
  includeContributing?: boolean;
  includeChangelog?: boolean;
}

interface GeneratedDocs {
  files: { path: string; content: string }[];
}

/**
 * Generate complete documentation for an MCP project
 */
export async function generateDocumentation(config: DocGeneratorConfig): Promise<GeneratedDocs> {
  const outputDir = config.outputDir || config.projectPath;
  const files: { path: string; content: string }[] = [];

  // Read MCP spec
  const spec = await readMCPSpec(config.projectPath);

  // Read environment configuration
  const envVars = await readEnvExample(config.projectPath);

  // Generate README.md
  const readme = generateReadme(spec, envVars);
  files.push({ path: 'README.md', content: readme });

  // Generate API.md
  if (config.includeApi !== false) {
    const api = generateApiDocs(spec);
    files.push({ path: 'docs/API.md', content: api });
  }

  // Generate CONTRIBUTING.md
  if (config.includeContributing !== false) {
    const contributing = generateContributing(spec);
    files.push({ path: 'CONTRIBUTING.md', content: contributing });
  }

  // Generate CHANGELOG.md
  if (config.includeChangelog !== false) {
    const changelog = generateChangelog(spec);
    files.push({ path: 'CHANGELOG.md', content: changelog });
  }

  // Write files
  for (const file of files) {
    const filePath = path.join(outputDir, file.path);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.content, 'utf-8');
  }

  return { files };
}

async function readMCPSpec(projectPath: string): Promise<MCPSpec> {
  try {
    const specPath = path.join(projectPath, 'mcp-spec.json');
    const content = await fs.readFile(specPath, 'utf-8');
    return JSON.parse(content) as MCPSpec;
  } catch {
    return {
      name: path.basename(projectPath),
      version: '1.0.0',
      description: 'An MCP Server',
      tools: []
    };
  }
}

async function readEnvExample(projectPath: string): Promise<EnvVariable[]> {
  try {
    const envPath = path.join(projectPath, '.env.example');
    const content = await fs.readFile(envPath, 'utf-8');
    const vars: EnvVariable[] = [];

    let currentComment = '';
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        currentComment = trimmed.slice(1).trim();
      } else if (trimmed && trimmed.includes('=')) {
        const [name, ...valueParts] = trimmed.split('=');
        const defaultValue = valueParts.join('=');
        vars.push({
          name: name.trim(),
          description: currentComment || `Configuration for ${name}`,
          required: !defaultValue,
          defaultValue: defaultValue || undefined
        });
        currentComment = '';
      }
    }

    return vars;
  } catch {
    return [];
  }
}

function generateReadme(spec: MCPSpec, envVars: EnvVariable[]): string {
  const toolDocs = spec.tools.map(tool => generateToolDoc(tool)).join('\n\n');
  const envTable = generateEnvTable(envVars);

  return `# ${spec.name}

${spec.description}

## Features

${spec.tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')}

## Quick Start

### Installation

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your configuration
\`\`\`

### Running Locally

\`\`\`bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
\`\`\`

### Using with Claude Desktop

Add to your Claude Desktop configuration (\`~/Library/Application Support/Claude/claude_desktop_config.json\`):

\`\`\`json
{
  "mcpServers": {
    "${spec.name}": {
      "command": "node",
      "args": ["/path/to/${spec.name}/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
\`\`\`

## Configuration

${envTable}

## Available Tools

${toolDocs || '_No tools defined yet._'}

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/mcp\` | POST | MCP protocol endpoint |
| \`/health\` | GET | Health check |
| \`/ready\` | GET | Readiness check |
| \`/.well-known/mcp-configuration\` | GET | Server discovery |
| \`/metrics\` | GET | Prometheus metrics (if enabled) |

## Deployment

### Docker

\`\`\`bash
docker build -t ${spec.name} .
docker run -p 3000:3000 --env-file .env ${spec.name}
\`\`\`

### AWS Lambda

\`\`\`bash
npm run build
npx serverless deploy
\`\`\`

See [Deployment Guide](docs/DEPLOYMENT.md) for more options.

## Development

### Running Tests

\`\`\`bash
npm test           # All tests
npm run test:unit  # Unit tests only
npm run test:coverage  # With coverage
\`\`\`

### Code Style

\`\`\`bash
npm run lint       # Check linting
npm run lint:fix   # Fix issues
\`\`\`

## API Reference

See [API Documentation](docs/API.md) for detailed API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
`;
}

function generateToolDoc(tool: ToolInfo): string {
  const props = tool.inputSchema.properties || {};
  const required = tool.inputSchema.required || [];

  const inputTable = Object.entries(props)
    .map(([name, prop]) => {
      const isRequired = required.includes(name);
      const typeStr = prop.enum ? prop.enum.map(e => `\`${e}\``).join(' | ') : prop.type;
      return `| \`${name}\` | ${typeStr} | ${isRequired ? 'Yes' : 'No'} | ${prop.description || '-'} |`;
    })
    .join('\n');

  const exampleInput = Object.entries(props).reduce((acc, [name, prop]) => {
    if (required.includes(name)) {
      acc[name] = prop.type === 'string' ? 'example value' :
                  prop.type === 'number' ? 42 :
                  prop.type === 'boolean' ? true : null;
    }
    return acc;
  }, {} as Record<string, unknown>);

  return `### ${tool.name}

${tool.description}

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
${inputTable || '| _none_ | - | - | No parameters required |'}

**Example:**

\`\`\`json
// Request
${JSON.stringify(exampleInput, null, 2)}

// Response
{
  "result": "...",
  "metadata": {
    "processedAt": "2024-01-01T00:00:00Z"
  }
}
\`\`\``;
}

function generateEnvTable(envVars: EnvVariable[]): string {
  if (envVars.length === 0) {
    return '_No environment variables required._';
  }

  const rows = envVars.map(v =>
    `| \`${v.name}\` | ${v.description} | ${v.required ? 'Yes' : 'No'} | ${v.defaultValue || '-'} |`
  ).join('\n');

  return `| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
${rows}`;
}

function generateApiDocs(spec: MCPSpec): string {
  const toolDocs = spec.tools.map(tool => generateApiToolDoc(tool)).join('\n\n---\n\n');

  return `# API Reference

## Overview

**Protocol**: MCP 2025-03-26
**Transport**: Streamable HTTP / stdio
**Content-Type**: application/json

## Authentication

If OAuth 2.0 PKCE is enabled, include the access token in requests:

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Discovery

### GET /.well-known/mcp-configuration

Returns server capabilities and authentication endpoints.

**Response:**

\`\`\`json
{
  "mcp_version": "2025-03-26",
  "server_name": "${spec.name}",
  "server_version": "${spec.version}",
  "capabilities": ["tools"],
  "transport": ["streamable-http", "stdio"],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
\`\`\`

## JSON-RPC Methods

### initialize

Initialize the MCP session.

**Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": {
      "name": "client-name",
      "version": "1.0.0"
    }
  },
  "id": 1
}
\`\`\`

### tools/list

List available tools.

**Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
\`\`\`

### tools/call

Execute a tool.

**Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "tool-name",
    "arguments": { ... }
  },
  "id": 3
}
\`\`\`

## Tools Reference

${toolDocs || '_No tools defined yet._'}

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Invalid JSON-RPC request |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Server error |
| -32001 | Authentication error | Invalid or expired token |
| -32002 | Rate limit exceeded | Too many requests |

## Rate Limiting

Requests are rate limited to 100 requests per minute per client.

**Response Headers:**
- \`X-RateLimit-Limit\`: Maximum requests per window
- \`X-RateLimit-Remaining\`: Remaining requests
- \`X-RateLimit-Reset\`: Window reset time (Unix timestamp)
`;
}

function generateApiToolDoc(tool: ToolInfo): string {
  const props = tool.inputSchema.properties || {};
  const required = tool.inputSchema.required || [];

  const paramsTable = Object.entries(props)
    .map(([name, prop]) => {
      const isRequired = required.includes(name);
      return `| \`${name}\` | ${prop.type} | ${isRequired ? 'Yes' : 'No'} | ${prop.description || '-'} |`;
    })
    .join('\n');

  return `## ${tool.name}

${tool.description}

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
${paramsTable || '| - | - | - | No parameters |'}

**Request Example:**

\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "${tool.name}",
    "arguments": {
      ${required.map(r => `"${r}": "value"`).join(',\n      ')}
    }
  },
  "id": 1
}
\`\`\`

**Success Response:**

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ]
  }
}
\`\`\``;
}

function generateContributing(spec: MCPSpec): string {
  return `# Contributing to ${spec.name}

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Getting Started

1. Fork the repository
2. Clone your fork:
   \`\`\`bash
   git clone https://github.com/YOUR-USERNAME/${spec.name}.git
   cd ${spec.name}
   \`\`\`
3. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
4. Create a branch:
   \`\`\`bash
   git checkout -b feature/your-feature-name
   \`\`\`

## Adding New Tools

1. Create tool file: \`src/tools/your-tool.ts\`

\`\`\`typescript
import { Tool, ToolInput, ToolOutput } from '../types';

interface YourInput extends ToolInput {
  param: string;
}

interface YourOutput extends ToolOutput {
  result: string;
}

export const yourTool: Tool<YourInput, YourOutput> = {
  name: 'your-tool',
  description: 'Description of what your tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param: {
        type: 'string',
        description: 'Parameter description'
      }
    },
    required: ['param'],
    additionalProperties: false
  },
  async execute(input: YourInput): Promise<YourOutput> {
    // Implement your logic
    return { result: \`Processed: \${input.param}\` };
  }
};
\`\`\`

2. Add tests: \`tests/tools/your-tool.test.ts\`
3. Register in \`src/index.ts\`
4. Update \`mcp-spec.json\`

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Conventional Commits for messages

\`\`\`bash
# Check style
npm run lint

# Fix issues
npm run lint:fix
\`\`\`

## Testing

\`\`\`bash
# Run all tests
npm test

# Run with coverage (target: 80%+)
npm run test:coverage

# Run specific test
npm test -- --testPathPattern="your-tool"
\`\`\`

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add entry to CHANGELOG.md
4. Submit PR with clear description
5. Address review feedback

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

\`\`\`
type(scope): description

[optional body]

[optional footer]
\`\`\`

**Types:** \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`

**Examples:**
\`\`\`
feat(tools): add new data-fetch tool
fix(auth): handle expired tokens correctly
docs(readme): update installation instructions
\`\`\`

## Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all inputs
- Follow OWASP guidelines

## Questions?

Open an issue or reach out to maintainers.
`;
}

function generateChangelog(spec: MCPSpec): string {
  const today = new Date().toISOString().split('T')[0];
  const toolsList = spec.tools.map(t => `- Tool: ${t.name}`).join('\n');

  return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- _New features will be documented here_

### Changed
- _Changes to existing functionality_

### Fixed
- _Bug fixes_

### Security
- _Security patches_

## [${spec.version}] - ${today}

### Added
- Initial release
${toolsList}
- MCP 2025-03-26 specification compliance
- Streamable HTTP transport support
- Health check endpoints
- Structured JSON logging
- Docker deployment support
- Kubernetes configuration

### Security
- OAuth 2.0 PKCE authentication support
- Input validation with JSON Schema
- Rate limiting
- CORS configuration

[Unreleased]: https://github.com/user/${spec.name}/compare/v${spec.version}...HEAD
[${spec.version}]: https://github.com/user/${spec.name}/releases/tag/v${spec.version}
`;
}

/**
 * Generate documentation for a specific tool
 */
export function generateToolDocumentation(tool: ToolInfo): string {
  return generateToolDoc(tool);
}
