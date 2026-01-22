---
name: docs-gen
description: Generate comprehensive API documentation, READMEs, and usage guides for MCP servers. Use this for documentation creation and updates.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# MCP Documentation Generation Skill

## Purpose

Auto-generate professional documentation for MCP servers including API references, usage guides, and contribution guidelines.

## Quick Start

### CLI Usage

```bash
# Generate all documentation
mcp-gen docs

# Generate specific docs
mcp-gen docs --readme           # Only README.md
mcp-gen docs --api              # Only API.md
mcp-gen docs --contributing     # Only CONTRIBUTING.md
mcp-gen docs --changelog        # Only CHANGELOG.md

# Custom output directory
mcp-gen docs --output ./docs

# Dry run (preview without writing)
mcp-gen docs --dry-run
```

### Programmatic Usage

```typescript
import { generateDocumentation, generateToolDocumentation } from './src/utils/docs-generator';

// Generate all documentation
const result = await generateDocumentation({
  projectPath: './my-mcp-server',
  outputDir: './my-mcp-server',
  includeApi: true,
  includeContributing: true,
  includeChangelog: true
});

console.log('Generated:', result.files.map(f => f.path));
// Generated: ['README.md', 'docs/API.md', 'CONTRIBUTING.md', 'CHANGELOG.md']

// Generate docs for a single tool
const toolDoc = generateToolDocumentation({
  name: 'fetch-user',
  description: 'Fetch user by ID',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' }
    },
    required: ['userId']
  }
});
```

## Utility Reference

**File**: `src/utils/docs-generator.ts`

**Functions**:
- `generateDocumentation(config)` - Generate all docs from mcp-spec.json
- `generateToolDocumentation(tool)` - Generate docs for a single tool

**Config Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectPath` | string | required | Path to MCP project |
| `outputDir` | string | projectPath | Output directory |
| `includeApi` | boolean | true | Generate API.md |
| `includeContributing` | boolean | true | Generate CONTRIBUTING.md |
| `includeChangelog` | boolean | true | Generate CHANGELOG.md |

**Sources Used**:
- `mcp-spec.json` - Tool definitions and schemas
- `.env.example` - Environment variable documentation

## Documentation Artifacts

### 1. README.md

```markdown
# {project-name}

{description}

## Features

- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

## Quick Start

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Running Locally

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Using with Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "{project-name}": {
      "command": "node",
      "args": ["/path/to/{project-name}/dist/index.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `API_KEY` | External API key | Yes | - |
| `PORT` | Server port | No | 3000 |
| `LOG_LEVEL` | Logging level | No | info |

## Available Tools

### {tool-name}

{tool description}

**Input:**
```json
{
  "paramName": "string (required) - Description"
}
```

**Output:**
```json
{
  "result": "string",
  "metadata": { ... }
}
```

**Example:**
```json
// Request
{ "paramName": "example value" }

// Response
{ "result": "processed value", "metadata": { "processedAt": "2024-01-01T00:00:00Z" } }
```

## Deployment

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

### Docker

```bash
docker build -t {project-name} .
docker run -p 3000:3000 --env-file .env {project-name}
```

## Development

### Running Tests

```bash
npm test           # All tests
npm run test:unit  # Unit tests only
npm run test:coverage  # With coverage
```

### Code Style

```bash
npm run lint       # Check linting
npm run lint:fix   # Fix issues
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
```

### 2. API.md (OpenAPI-style Reference)

```markdown
# API Reference

## Overview

**Base URL**: `http://localhost:3000` (stdio) or configured endpoint (HTTP)
**Protocol**: MCP 2025-03-26
**Authentication**: OAuth 2.0 PKCE (if enabled)

## Discovery

### GET /.well-known/mcp-configuration

Returns server capabilities and authentication endpoints.

**Response:**
```json
{
  "mcp_version": "2025-03-26",
  "server_name": "{project-name}",
  "capabilities": ["tools"],
  "authentication": {
    "type": "oauth2",
    "authorization_endpoint": "/oauth/authorize",
    "token_endpoint": "/oauth/token"
  }
}
```

## Tools

### {tool-name}

{Detailed tool description}

**Endpoint**: POST /tools/{tool-name}
**Content-Type**: application/json

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputField` | string | Yes | Primary input |
| `options` | object | No | Additional options |
| `options.limit` | number | No | Max results (default: 10) |

**Example Request:**
```json
{
  "inputField": "example value",
  "options": {
    "limit": 5
  }
}
```

**Success Response (200):**
```json
{
  "result": "processed value",
  "metadata": {
    "processedAt": "2024-01-01T00:00:00Z",
    "inputLength": 13
  }
}
```

**Error Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 400 | Invalid input | `{"error": "Validation error", "details": [...]}` |
| 401 | Unauthorized | `{"error": "Invalid or expired token"}` |
| 429 | Rate limited | `{"error": "Too many requests", "retryAfter": 60}` |
| 500 | Server error | `{"error": "Internal server error"}` |
```

### 3. CONTRIBUTING.md

```markdown
# Contributing to {project-name}

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/{project-name}.git
   cd {project-name}
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Adding New Tools

1. Create tool file: `src/tools/your-tool.ts`
2. Follow the tool template pattern
3. Add tests: `tests/tools/your-tool.test.ts`
4. Update tool registry: `src/tools/index.ts`
5. Update mcp-spec.json

See [Tool Development Guide](docs/TOOLS.md) for details.

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Conventional Commits for messages

```bash
# Check style
npm run lint

# Fix issues
npm run lint:fix

# Format code
npm run format
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage (target: 80%+)
npm run test:coverage

# Run specific test
npm test -- path/to/test.ts
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add entry to CHANGELOG.md
4. Submit PR with clear description
5. Address review feedback

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(tools): add new fetch-user tool
fix(auth): handle expired tokens correctly
docs(readme): update installation instructions
```

## Questions?

Open an issue or reach out to maintainers.
```

### 4. CHANGELOG.md

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description

### Changed
- Changed behavior description

### Fixed
- Bug fix description

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
- Tool: example-tool
- OAuth 2.0 PKCE authentication
- Streamable HTTP transport
- Docker deployment support

[Unreleased]: https://github.com/user/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```

## Documentation Generation Process

### Step 1: Gather Information

```bash
# Extract tool information
grep -rn "name:\|description:" src/tools/ --include="*.ts"

# Extract configuration
cat .env.example

# Extract dependencies
cat package.json | jq '.dependencies'
```

### Step 2: Generate from Templates

Parse mcp-spec.json for tool definitions and schemas.

### Step 3: Format and Write

Apply consistent markdown formatting with proper code blocks.

## Reference Files

- `test/src/utils/template-loader.ts` - README templates
- `test/mcp-spec.json` - Tool specifications
- `test/.env.example` - Configuration reference
