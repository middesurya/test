# sample-mcp-server

An MCP server built with mcp-gen

## Features

- Streamable HTTP transport (MCP 2025-03-26 spec)
- Serverless-ready (AWS Lambda, Vercel, Cloud Run)
- CORS configured
- Health check endpoints
- /.well-known discovery endpoint
- Structured JSON logging

## Quick Start

```bash
npm install
npm run dev
```

Server will be available at http://localhost:3000

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /mcp | POST | MCP protocol endpoint |
| /health | GET | Health check |
| /.well-known/mcp-configuration | GET | Server discovery |

## Deployment

### AWS Lambda

```bash
npm run build
npm run deploy:lambda
```

### Vercel

```bash
npm run deploy:vercel
```

### Docker

```bash
docker build -t sample-mcp-server .
docker run -p 3000:3000 sample-mcp-server
```

## Testing

```bash
# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"example-tool","arguments":{"query":"test"}},"id":2}'
```

## License

MIT
