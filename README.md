# mcp-gen

**MCP Server Boilerplate Generator** - Quickly scaffold MCP servers for vibe coding

## Overview

`mcp-gen` is a CLI tool that eliminates repetitive setup work when building MCP (Model Context Protocol) servers. Generate fully-functional project scaffolds with a single command.

## Installation

```bash
npm install -g mcp-gen
```

## Quick Start

```bash
# Create a new MCP server project
mcp-gen create my-mcp-server

# Add a new tool to your project
cd my-mcp-server
mcp-gen add tool my-custom-tool

# List available templates
mcp-gen templates
```

## Features

- **Interactive project generator** with sensible defaults
- **Pre-built templates** for common use cases (basic, Discord bot, API wrapper)
- **Auto-generated MCP specifications** (mcp-spec.json)
- **Test harnesses** with mock LLM support
- **Documentation stubs** for quick onboarding
- **Docker configuration** (optional)
- **Authentication boilerplate** (OAuth, API keys)

## Commands

### `mcp-gen create <project-name>`

Create a new MCP server project.

Options:
- `-t, --template <name>` - Template to use (basic, discord-bot, api-wrapper)
- `--typescript` - Use TypeScript (default)
- `--python` - Use Python instead of TypeScript
- `--docker` - Include Docker configuration
- `--auth <type>` - Include authentication (oauth, apikey)
- `--no-interactive` - Skip prompts, use defaults

### `mcp-gen add tool <tool-name>`

Add a new tool to an existing project.

Options:
- `-d, --description <desc>` - Tool description
- `-i, --inputs <schema>` - Input schema (JSON)

### `mcp-gen templates`

List all available project templates.

## Generated Project Structure

```
my-mcp-server/
├── src/
│   ├── index.ts              # Server entry point
│   ├── server.ts             # MCP server implementation
│   ├── types.ts              # Type definitions
│   ├── tools/
│   │   └── example-tool.ts   # Example tool
│   └── utils/
│       └── logger.ts         # Logging utility
├── tests/
│   └── tools/
│       └── example-tool.test.ts
├── mcp-spec.json             # MCP specification
├── package.json
├── tsconfig.json
└── README.md
```

## Why mcp-gen?

Building MCP servers involves repetitive boilerplate:
- Writing tool specifications (JSON/YAML schemas)
- Setting up project structure
- Configuring logging and error handling
- Creating test harnesses

`mcp-gen` automates all of this so you can focus on your tool's core logic.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding Custom Templates

1. Create a directory in `templates/<template-name>/`
2. Add `template.json` with template metadata
3. Add template files in `files/` subdirectory
4. Submit a pull request

## License

MIT
