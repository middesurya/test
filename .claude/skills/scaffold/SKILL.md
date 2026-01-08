---
name: scaffold
description: Create new MCP server projects with 2025 spec compliance, security patterns, and deployment-ready configurations. Use this when creating new MCP servers or adding new project templates.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# MCP Project Scaffolding Skill

## Purpose

Generate production-ready MCP server projects with modern patterns including Streamable HTTP transport (2025-03-26 spec), OAuth 2.0 PKCE authentication, and multi-agent coordination support.

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `basic` | Minimal MCP server with single tool | Learning, prototyping |
| `streamable-http` | Serverless-compatible transport | AWS Lambda, Vercel, Cloud Run |
| `discord-bot` | Discord.js integration | Bot development |
| `api-wrapper` | REST API wrapper with caching | External API integration |
| `multi-agent` | Orchestrator/worker pattern | Complex workflows |
| `enterprise` | Full security suite | Production deployments |

## Project Generation Steps

### 1. Validate Project Name
```bash
# Must be valid npm package name
# Lowercase, no spaces, alphanumeric + hyphens
```

### 2. Create Directory Structure
```
{project-name}/
├── src/
│   ├── index.ts              # Server entry point
│   ├── server.ts             # MCP server setup
│   ├── transport/            # Transport layer
│   │   ├── stdio.ts          # Standard IO transport
│   │   └── streamable-http.ts # Streamable HTTP (2025 spec)
│   ├── auth/                 # Authentication (if enabled)
│   │   ├── oauth-pkce.ts     # PKCE flow
│   │   └── middleware.ts     # Auth middleware
│   ├── tools/                # Tool implementations
│   │   ├── index.ts          # Tool registry
│   │   └── example-tool.ts   # Example tool
│   ├── config/
│   │   └── settings.ts       # Configuration management
│   └── utils/
│       ├── logger.ts         # Structured logging
│       └── error-handler.ts  # Error classification
├── .well-known/
│   └── mcp-configuration     # Discovery endpoint
├── tests/
│   ├── mocks/
│   │   └── llm-mock.ts       # LLM response mocking
│   └── tools/
│       └── example-tool.test.ts
├── docs/
│   └── API.md                # Auto-generated API docs
├── .env.example              # Environment template
├── Dockerfile                # Multi-stage build
├── docker-compose.yml        # Container orchestration
├── mcp-spec.json             # MCP specification
├── package.json
├── tsconfig.json
└── README.md
```

### 3. Generate mcp-spec.json
```json
{
  "name": "{project-name}",
  "version": "1.0.0",
  "description": "{project-description}",
  "transport": ["stdio", "streamable-http"],
  "capabilities": {
    "tools": true,
    "resources": false,
    "prompts": false
  },
  "tools": [
    {
      "name": "example-tool",
      "description": "An example tool",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      }
    }
  ],
  "security": {
    "authentication": "oauth-pkce",
    "authorization": "capability-based"
  }
}
```

### 4. Configure /.well-known Endpoint
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

## 2025 MCP Spec Compliance Checklist

- [ ] Streamable HTTP transport support (for serverless)
- [ ] OAuth 2.0 with PKCE flow (mandatory for auth)
- [ ] Resource Indicators for security scoping
- [ ] Capability-based access control
- [ ] /.well-known/mcp-configuration endpoint

## Security Defaults (Defense in Depth)

1. **Input Validation**: JSON Schema validation on all tool inputs
2. **Rate Limiting**: Configurable request limits
3. **Secrets Management**: Environment-based, no hardcoding
4. **Audit Logging**: All tool invocations logged
5. **Error Sanitization**: No internal details in error responses

## Usage Examples

### Create Basic Project
```
Create a new MCP server called "data-processor" using the basic template with TypeScript
```

### Create Serverless Project
```
Scaffold an MCP server named "lambda-api" with Streamable HTTP transport for AWS Lambda deployment
```

### Create Enterprise Project
```
Generate an enterprise MCP server "corp-assistant" with OAuth 2.0 PKCE, audit logging, and Prometheus metrics
```

## Reference Files

- `test/src/commands/create.ts` - Create command implementation
- `test/src/utils/generator.ts` - Core generation logic
- `test/src/utils/template-loader.ts` - Template system
- `test/templates/registry.json` - Template metadata

## Performance Targets

Generated projects should meet:
- **Throughput**: >1000 requests/second
- **Latency P95**: <100ms
- **Availability**: >99.9% uptime
