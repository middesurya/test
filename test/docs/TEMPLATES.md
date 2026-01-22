# MCP-Gen Templates Reference

## Overview

MCP-Gen provides several templates for different use cases. Each template is designed for specific deployment scenarios and feature requirements.

## Available Templates

### Basic

**Description:** Simple MCP server with example tool. Perfect for getting started.

**Features:**
- Minimal dependencies
- Example tool implementation
- TypeScript and Python support
- stdio transport

**Use Cases:**
- Learning MCP protocol
- Simple internal tools
- Quick prototypes

**Command:**
```bash
mcp-gen create my-server --template basic
```

---

### Streamable HTTP

**Description:** Serverless-compatible MCP server with HTTP transport.

**Features:**
- Streamable HTTP (2025 spec)
- Serverless deployment ready
- AWS Lambda / Vercel / Cloud Run support
- CORS configuration
- Health checks

**Use Cases:**
- Serverless deployments
- Public APIs
- Cloud-native applications

**Command:**
```bash
mcp-gen create my-api --template streamable-http
```

---

### Discord Bot

**Description:** MCP server integrated with Discord.js.

**Features:**
- Discord.js v14 integration
- Slash commands
- Bot event handlers
- Message handling

**Use Cases:**
- Discord bots with MCP tools
- Chat integrations
- Community tools

**Command:**
```bash
mcp-gen create my-bot --template discord-bot
```

---

### API Wrapper

**Description:** MCP server wrapping external APIs with caching.

**Features:**
- External API integration
- Response caching
- Rate limiting
- Error handling
- Retry logic

**Use Cases:**
- Wrapping REST APIs
- API aggregation
- Third-party service integration

**Command:**
```bash
mcp-gen create my-wrapper --template api-wrapper
```

---

### Multi-Agent

**Description:** Orchestrator/worker pattern for complex workflows.

**Features:**
- Orchestrator agent
- Worker agents
- Task queue
- Shared state management
- Priority-based scheduling

**Languages:** TypeScript, Python (FastMCP)

**Use Cases:**
- Complex data processing
- Workflow orchestration
- Background task processing

**Command:**
```bash
# TypeScript
mcp-gen create my-agents --template multi-agent

# Python
mcp-gen create my-agents --template multi-agent --python
```

---

### Enterprise

**Description:** Production-ready server with OAuth 2.0, audit logging, and rate limiting.

**Features:**
- OAuth 2.0 PKCE authentication
- JWT token validation
- Rate limiting (per-tenant)
- Circuit breaker
- Audit logging
- Health/readiness probes
- RFC 9728 Protected Resource Metadata
- RFC 8707 Resource Indicators

**Languages:** TypeScript, Python

**Use Cases:**
- Production deployments
- Multi-tenant applications
- Regulated industries
- Enterprise integrations

**Command:**
```bash
# TypeScript
mcp-gen create my-enterprise --template enterprise --auth oauth

# Python
mcp-gen create my-enterprise --template enterprise --python --auth oauth
```

---

### Observable

**Description:** Full observability stack with OpenTelemetry.

**Features:**
- OpenTelemetry tracing
- Prometheus metrics
- W3C Trace Context
- Jaeger integration
- Auto-instrumentation middleware
- Docker Compose for observability stack

**Use Cases:**
- Production monitoring
- Debugging distributed systems
- Performance analysis
- SLA tracking

**Command:**
```bash
mcp-gen create my-observable --template observable
```

**Docker Setup:**
```bash
cd my-observable
docker-compose -f docker-compose.otel.yml up -d
```

---

### Gateway

**Description:** Enterprise gateway for multi-server deployments.

**Features:**
- Centralized authentication
- Request routing
- Load balancing (round-robin, weighted, least-connections)
- Per-tenant rate limiting
- Service discovery
- Quota management
- Health monitoring

**Use Cases:**
- Multi-server deployments
- API gateway
- Microservices architecture
- Enterprise deployments

**Command:**
```bash
mcp-gen create my-gateway --template gateway
```

**Configuration:**
Edit `config/servers.json` to configure backend servers:
```json
{
  "servers": [
    {
      "name": "primary",
      "url": "http://localhost:3001",
      "weight": 2,
      "enabled": true
    }
  ],
  "loadBalancing": "weighted"
}
```

---

## Template Comparison

| Feature | Basic | HTTP | Discord | API | Multi-Agent | Enterprise | Observable | Gateway |
|---------|-------|------|---------|-----|-------------|------------|------------|---------|
| TypeScript | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| stdio | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| HTTP | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| OAuth | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Rate Limiting | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Metrics | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Tracing | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Docker | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## Choosing a Template

### For Learning / Prototyping
→ **Basic** - Minimal setup, easy to understand

### For Serverless / Cloud
→ **Streamable HTTP** - AWS Lambda, Vercel, Cloud Run ready

### For Chat/Bot Integration
→ **Discord Bot** - Full Discord.js integration

### For API Integration
→ **API Wrapper** - Built-in caching and retry

### For Complex Workflows
→ **Multi-Agent** - Task queue and orchestration

### For Production / Enterprise
→ **Enterprise** - OAuth, rate limiting, audit logging

### For Debugging / Monitoring
→ **Observable** - Full OpenTelemetry stack

### For Multi-Server Setups
→ **Gateway** - Load balancing and routing

---

## Creating Custom Templates

You can create custom templates by:

1. Copying an existing template from `templates/`
2. Modifying the `.hbs` files
3. Updating `registry.json` with your template metadata
4. Updating `template-loader.ts` to include your template

Template files use Handlebars syntax with these variables:
- `{{projectName}}` - Project name
- `{{projectDescription}}` - Project description
- `{{version}}` - Version number
- `{{author}}` - Author name
