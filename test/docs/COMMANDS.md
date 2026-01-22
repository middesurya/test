# MCP-Gen Commands Reference

## Overview

MCP-Gen provides a comprehensive set of commands for creating, managing, and deploying MCP servers.

## Commands

### `mcp-gen create <project-name>`

Create a new MCP server project.

**Arguments:**
- `project-name` - Name of the project to create

**Options:**
- `-t, --template <name>` - Template to use (default: "basic")
- `--typescript` - Use TypeScript (default)
- `--python` - Use Python instead of TypeScript
- `--docker` - Include Docker configuration
- `--auth <type>` - Include authentication (oauth, apikey)
- `--no-interactive` - Skip prompts, use defaults

**Examples:**
```bash
# Create a basic MCP server
mcp-gen create my-server

# Create with enterprise template and OAuth
mcp-gen create my-api --template enterprise --auth oauth

# Create Python server with Docker
mcp-gen create my-python-server --python --docker

# Non-interactive with specific template
mcp-gen create ci-server --template basic --no-interactive
```

---

### `mcp-gen add`

Add components to an existing MCP server project.

**Subcommands:**
- `add tool <name>` - Add a new tool
- `add middleware <name>` - Add middleware component
- `add resource <name>` - Add a resource handler

**Options:**
- `--description <text>` - Component description
- `--template <type>` - Use a template

**Examples:**
```bash
# Add a new tool
mcp-gen add tool my-tool

# Add middleware
mcp-gen add middleware rate-limiter

# Add resource handler
mcp-gen add resource user-data
```

---

### `mcp-gen publish`

Publish MCP server to the official registry.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `--dry-run` - Validate without publishing
- `--registry <url>` - Registry URL (default: registry.modelcontextprotocol.io)
- `--token <token>` - Registry API token
- `--force` - Override validation warnings
- `--generate` - Generate manifest from project
- `--save` - Save generated manifest

**Examples:**
```bash
# Validate manifest
mcp-gen publish --dry-run

# Generate and publish
mcp-gen publish --generate --token $MCP_REGISTRY_TOKEN

# Force publish with warnings
mcp-gen publish --force
```

---

### `mcp-gen registry`

MCP Registry operations.

**Subcommands:**
- `registry validate [path]` - Validate registry.json manifest
- `registry info <name>` - Get information about a registry server

**Options for validate:**
- `--generate` - Generate manifest from project
- `--save` - Save generated manifest
- `--strict` - Treat warnings as errors
- `--json` - Output as JSON

**Examples:**
```bash
# Validate local manifest
mcp-gen registry validate

# Generate and validate
mcp-gen registry validate --generate

# Get server info from registry
mcp-gen registry info my-server-name
```

---

### `mcp-gen test:mock`

Generate mock MCP server for client testing.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `-o, --output <file>` - Output file (default: "mock-server.ts")
- `-p, --port <port>` - Port for mock server (default: "3001")
- `--tools <tools>` - Comma-separated list of tools to mock

**Examples:**
```bash
# Generate mock server
mcp-gen test:mock

# Custom output and port
mcp-gen test:mock -o test-mock.ts -p 4000

# Mock specific tools
mcp-gen test:mock --tools search,analyze,process
```

---

### `mcp-gen test:chaos`

Run chaos tests (dependency failures, latency injection).

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `-d, --duration <seconds>` - Test duration (default: "60")
- `-f, --failure-rate <percent>` - Failure injection rate (default: "10")
- `-l, --latency <ms>` - Injected latency (default: "0")
- `--scenarios <list>` - Comma-separated chaos scenarios

**Examples:**
```bash
# Run with default settings
mcp-gen test:chaos

# Custom duration and failure rate
mcp-gen test:chaos -d 120 -f 20

# With latency injection
mcp-gen test:chaos -l 500 --scenarios random_failure,timeout
```

---

### `mcp-gen test:compat`

Validate MCP spec compliance.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `--spec-version <version>` - MCP spec version (default: "2025-03-26")
- `-v, --verbose` - Show detailed results
- `--json` - Output results as JSON

**Examples:**
```bash
# Run compatibility check
mcp-gen test:compat

# Verbose output
mcp-gen test:compat -v

# JSON output for CI
mcp-gen test:compat --json
```

---

### `mcp-gen secrets:init`

Initialize secrets provider configuration.

**Arguments:**
- `[path]` - Path to project (default: ".")

**Options:**
- `-p, --provider <provider>` - Secrets provider (aws, vault, azure, env, file)
- `--force` - Overwrite existing configuration

**Examples:**
```bash
# Interactive setup
mcp-gen secrets:init

# Use AWS Secrets Manager
mcp-gen secrets:init --provider aws

# Use HashiCorp Vault
mcp-gen secrets:init --provider vault

# Local file for development
mcp-gen secrets:init --provider file
```

---

### `mcp-gen secrets:rotate`

Rotate a secret.

**Arguments:**
- `[path]` - Path to project (default: ".")

**Options:**
- `-s, --secret <name>` - Secret name to rotate (required)
- `-v, --value <value>` - New secret value
- `-g, --generate` - Generate a random value

**Examples:**
```bash
# Rotate with provided value
mcp-gen secrets:rotate -s API_KEY -v "new-key-value"

# Generate random value
mcp-gen secrets:rotate -s JWT_SECRET --generate
```

---

### `mcp-gen inspect`

Launch MCP Inspector for debugging.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `-c, --command <cmd>` - Custom command to run the server
- `-e, --env <vars...>` - Environment variables (KEY=VALUE)
- `-p, --port <port>` - Inspector port (default: "5173")
- `--no-open` - Do not open browser automatically

**Examples:**
```bash
# Launch inspector
mcp-gen inspect

# Custom server command
mcp-gen inspect --command "npm run dev"

# With environment variables
mcp-gen inspect -e DEBUG=true -e PORT=3001
```

---

### `mcp-gen deploy`

Generate deployment configurations.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `--target <target>` - Deployment target (docker, aws-lambda, vercel, gcp, azure)
- `--all` - Generate all targets
- `-o, --output <dir>` - Output directory (default: "deploy")

**Examples:**
```bash
# Generate Docker deployment
mcp-gen deploy --target docker

# Generate all deployment configs
mcp-gen deploy --all

# Custom output directory
mcp-gen deploy --target aws-lambda -o infra/
```

---

### `mcp-gen docs`

Generate documentation for the MCP server.

**Arguments:**
- `[path]` - Path to MCP server project (default: ".")

**Options:**
- `--format <format>` - Output format (markdown, html)
- `-o, --output <file>` - Output file

**Examples:**
```bash
# Generate markdown docs
mcp-gen docs

# Generate HTML docs
mcp-gen docs --format html -o docs/api.html
```

---

### `mcp-gen templates`

List available templates.

**Examples:**
```bash
mcp-gen templates
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_REGISTRY_TOKEN` | API token for registry publishing |
| `AWS_ACCESS_KEY_ID` | AWS credentials for Secrets Manager |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for Secrets Manager |
| `AWS_REGION` | AWS region |
| `VAULT_ADDR` | HashiCorp Vault address |
| `VAULT_TOKEN` | HashiCorp Vault token |
| `AZURE_KEY_VAULT_URL` | Azure Key Vault URL |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Project not found |
| 4 | Validation failed |
| 5 | Network error |
