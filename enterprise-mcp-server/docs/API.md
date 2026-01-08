# API Reference

## Overview

**Protocol**: MCP 2025-03-26
**Transport**: Streamable HTTP / stdio
**Content-Type**: application/json

## Authentication

If OAuth 2.0 PKCE is enabled, include the access token in requests:

```
Authorization: Bearer <access_token>
```

## Discovery

### GET /.well-known/mcp-configuration

Returns server capabilities and authentication endpoints.

**Response:**

```json
{
  "mcp_version": "2025-03-26",
  "server_name": "enterprise-mcp-server",
  "server_version": "1.0.0",
  "capabilities": ["tools"],
  "transport": ["streamable-http", "stdio"],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

## JSON-RPC Methods

### initialize

Initialize the MCP session.

**Request:**
```json
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
```

### tools/list

List available tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
```

### tools/call

Execute a tool.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "tool-name",
    "arguments": { ... }
  },
  "id": 3
}
```

## Tools Reference

## example-tool

An example tool to get you started

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `input` | string | Yes | The input to process |

**Request Example:**

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "example-tool",
    "arguments": {
      "input": "value"
    }
  },
  "id": 1
}
```

**Success Response:**

```json
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
```

---

## fetch-user

Fetch user profile by ID with optional email and profile data

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `userId` | string | Yes | The unique identifier of the user to fetch |
| `includeEmail` | boolean | No | Include user email (requires users:read:email scope) |
| `includeProfile` | boolean | No | Include extended profile information |

**Request Example:**

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "fetch-user",
    "arguments": {
      "userId": "value"
    }
  },
  "id": 1
}
```

**Success Response:**

```json
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
```

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
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Window reset time (Unix timestamp)
