import { MCPServer } from '../server';
import { logger } from '../utils/logger';

interface StreamableRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface StreamableResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Create a Streamable HTTP handler for serverless environments
 * Implements MCP 2025-03-26 Streamable HTTP transport
 */
export function createStreamableHttpHandler(server: MCPServer) {
  return async (event: any, context?: any): Promise<any> => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS' || event.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers,
        body: ''
      };
    }

    // Safely parse request body
    let body: any;
    try {
      body = typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body || event;
    } catch (parseError) {
      logger.error({ error: parseError, message: 'Invalid JSON in request body' });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error: Invalid JSON' }
        })
      };
    }

    try {
      const request: StreamableRequest = body;
      let response: StreamableResponse;

      switch (request.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2025-03-26',
              capabilities: {
                tools: {}
              },
              serverInfo: server.getCapabilities()
            }
          };
          break;

        case 'tools/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: server.getCapabilities().tools
            }
          };
          break;

        case 'tools/call':
          const { name, arguments: args } = request.params as any;
          const result = await server.handleToolCall(name, args);
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result) }]
            }
          };
          break;

        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
      };
    } catch (error) {
      logger.error({ error, message: 'Streamable HTTP handler error' });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error'
          }
        })
      };
    }
  };
}
