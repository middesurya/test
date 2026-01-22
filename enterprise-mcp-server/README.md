# enterprise-mcp-server

An MCP server built with mcp-gen

## Features

- **example-tool**: An example tool to get you started
- **fetch-user**: Fetch user profile by ID with optional email and profile data

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

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "enterprise-mcp-server": {
      "command": "node",
      "args": ["/path/to/enterprise-mcp-server/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Configuration for PORT | No | 3000 |
| `NODE_ENV` | Configuration for NODE_ENV | No | production |
| `LOG_LEVEL` | Configuration for LOG_LEVEL | No | info |
| `OAUTH_ISSUER` | Configuration for OAUTH_ISSUER | No | https://your-auth-provider.com |
| `RATE_LIMIT_WINDOW_MS` | Configuration for RATE_LIMIT_WINDOW_MS | No | 60000 |
| `RATE_LIMIT_MAX` | Configuration for RATE_LIMIT_MAX | No | 100 |

## Available Tools

### example-tool

An example tool to get you started

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | The input to process |

**Example:**

```json
// Request
{
  "input": "example value"
}

// Response
{
  "result": "...",
  "metadata": {
    "processedAt": "2024-01-01T00:00:00Z"
  }
}
```

### fetch-user

Fetch user profile by ID with optional email and profile data

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | The unique identifier of the user to fetch |
| `includeEmail` | boolean | No | Include user email (requires users:read:email scope) |
| `includeProfile` | boolean | No | Include extended profile information |

**Example:**

```json
// Request
{
  "userId": "example value"
}

// Response
{
  "result": "...",
  "metadata": {
    "processedAt": "2024-01-01T00:00:00Z"
  }
}
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP protocol endpoint |
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check |
| `/.well-known/mcp-configuration` | GET | Server discovery |
| `/metrics` | GET | Prometheus metrics (if enabled) |

## Deployment

### Docker

```bash
docker build -t enterprise-mcp-server .
docker run -p 3000:3000 --env-file .env enterprise-mcp-server
```

### AWS Lambda

```bash
npm run build
npx serverless deploy
```

See [Deployment Guide](docs/DEPLOYMENT.md) for more options.

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

## API Reference

See [API Documentation](docs/API.md) for detailed API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
