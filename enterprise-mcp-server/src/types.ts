import type { JSONSchema7 } from 'json-schema';

export interface ToolInput { [key: string]: unknown; }
export interface ToolOutput { [key: string]: unknown; }

export interface Tool<I extends ToolInput, O extends ToolOutput> {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  requiredScopes?: string[];
  execute(input: I): Promise<O>;
}

// JSON-RPC 2.0 Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// MCP Standard Error Codes
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom MCP error codes
  AUTHENTICATION_ERROR: -32001,
  AUTHORIZATION_ERROR: -32002,
  RATE_LIMIT_ERROR: -32003,
  TOOL_EXECUTION_ERROR: -32004
} as const;

// MCP Tool Result Format
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// MCP Capabilities
export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
}

// Extended request with user context
export interface AuthenticatedRequest {
  user?: {
    id: string;
    scopes: string[];
  };
}
