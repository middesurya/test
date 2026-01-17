# test-multi-agent

An MCP server built with mcp-gen

## Architecture

- **Orchestrator**: Distributes tasks, monitors progress
- **Workers**: Process tasks from the queue
- **Task Queue**: Priority-based distribution
- **State Manager**: Shared state with pub/sub

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

## License

MIT
