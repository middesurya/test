import http from 'http';
import Ajv from 'ajv';
import {
  Tool,
  ToolInput,
  ToolOutput,
  JsonRpcRequest,
  JsonRpcResponse,
  MCP_ERROR_CODES,
  MCPToolResult,
  AuthenticatedRequest
} from './types';
import { logger } from './utils/logger';
import { auditLog } from './utils/audit';
import { checkRateLimit, getRateLimitInfo } from './utils/rate-limiter';
import { recordRequest, getMetrics } from './utils/metrics';

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

// Initialize JSON Schema validator
const ajv = new Ajv({ allErrors: true, strict: false });

interface ServerConfig {
  name: string;
  version: string;
}

export function createServer(config: ServerConfig) {
  const tools = new Map<string, Tool<any, any>>();
  const middlewares: Middleware[] = [];

  // Helper to send JSON-RPC response
  const sendJsonRpcResponse = (res: http.ServerResponse, response: JsonRpcResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  };

  // Helper to send JSON-RPC error
  const sendJsonRpcError = (
    res: http.ServerResponse,
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ) => {
    sendJsonRpcResponse(res, {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    });
  };

  // Parse request body
  const parseBody = (req: http.IncomingMessage): Promise<string> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  };

  // Handle MCP JSON-RPC methods
  const handleMCPRequest = async (
    req: http.IncomingMessage & AuthenticatedRequest,
    res: http.ServerResponse,
    rpcRequest: JsonRpcRequest
  ) => {
    const { method, params, id } = rpcRequest;

    switch (method) {
      case 'initialize': {
        // Return server capabilities
        sendJsonRpcResponse(res, {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {
            protocolVersion: '2025-03-26',
            serverInfo: {
              name: config.name,
              version: config.version
            },
            capabilities: {
              tools: { listChanged: true }
            }
          }
        });
        break;
      }

      case 'tools/list': {
        // List all registered tools
        const toolList = Array.from(tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));

        sendJsonRpcResponse(res, {
          jsonrpc: '2.0',
          id: id ?? null,
          result: { tools: toolList }
        });
        break;
      }

      case 'tools/call': {
        const callParams = params as { name: string; arguments?: Record<string, unknown> } | undefined;

        if (!callParams?.name) {
          sendJsonRpcError(res, id ?? null, MCP_ERROR_CODES.INVALID_PARAMS, 'Missing tool name');
          return;
        }

        const tool = tools.get(callParams.name);
        if (!tool) {
          sendJsonRpcError(
            res,
            id ?? null,
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Tool not found: ${callParams.name}`
          );
          return;
        }

        // Check authorization (scopes)
        if (tool.requiredScopes && tool.requiredScopes.length > 0) {
          const userScopes = req.user?.scopes || [];
          const hasAllScopes = tool.requiredScopes.every(scope => userScopes.includes(scope));

          if (!hasAllScopes) {
            auditLog('tool.unauthorized', {
              tool: tool.name,
              userId: req.user?.id,
              requiredScopes: tool.requiredScopes,
              userScopes
            });
            sendJsonRpcError(
              res,
              id ?? null,
              MCP_ERROR_CODES.AUTHORIZATION_ERROR,
              `Insufficient permissions. Required scopes: ${tool.requiredScopes.join(', ')}`
            );
            return;
          }
        }

        // Validate input against schema
        const toolInput = callParams.arguments || {};
        const validate = ajv.compile(tool.inputSchema);
        const isValid = validate(toolInput);

        if (!isValid) {
          sendJsonRpcError(
            res,
            id ?? null,
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Input validation failed',
            validate.errors
          );
          return;
        }

        // Execute tool
        try {
          auditLog('tool.execute', {
            tool: tool.name,
            userId: req.user?.id
          });

          const result = await tool.execute(toolInput);

          // Format result as MCP content
          const mcpResult: MCPToolResult = {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };

          sendJsonRpcResponse(res, {
            jsonrpc: '2.0',
            id: id ?? null,
            result: mcpResult
          });

          auditLog('tool.success', {
            tool: tool.name,
            userId: req.user?.id
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          auditLog('tool.error', {
            tool: tool.name,
            userId: req.user?.id,
            error: errorMessage
          });

          // Return error in MCP format
          const mcpError: MCPToolResult = {
            content: [{
              type: 'text',
              text: errorMessage
            }],
            isError: true
          };

          sendJsonRpcResponse(res, {
            jsonrpc: '2.0',
            id: id ?? null,
            result: mcpError
          });
        }
        break;
      }

      case 'ping': {
        sendJsonRpcResponse(res, {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {}
        });
        break;
      }

      default: {
        sendJsonRpcError(
          res,
          id ?? null,
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${method}`
        );
      }
    }
  };

  return {
    use: (mw: Middleware) => middlewares.push(mw),

    registerTool: <I extends ToolInput, O extends ToolOutput>(tool: Tool<I, O>) => {
      tools.set(tool.name, tool);
      logger.debug({ tool: tool.name }, 'Tool registered');
    },

    listen: (port: number) => new Promise<http.Server>((resolve) => {
      const server = http.createServer(async (req, res) => {
        const start = Date.now();

        try {
          // Rate limiting
          const clientIp = req.socket.remoteAddress || 'unknown';
          if (!checkRateLimit(clientIp)) {
            const rateLimitInfo = getRateLimitInfo(clientIp);
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(rateLimitInfo?.limit || 100),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(rateLimitInfo?.reset || Date.now() + 60000),
              'Retry-After': '60'
            });
            res.end(JSON.stringify({ error: 'Rate limit exceeded', retryAfter: 60 }));
            recordRequest(Date.now() - start);
            return;
          }

          // Run middlewares
          let idx = 0;
          const runMiddlewares = (): Promise<void> => {
            return new Promise((resolve) => {
              const next = () => {
                if (idx < middlewares.length && !res.headersSent) {
                  middlewares[idx++](req, res, next);
                } else {
                  resolve();
                }
              };
              next();
            });
          };

          await runMiddlewares();

          // Skip if middleware already responded
          if (res.headersSent) {
            recordRequest(Date.now() - start);
            return;
          }

          // Routes
          if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy' }));

          } else if (req.url === '/ready' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ready', tools: tools.size }));

          } else if (req.url === '/metrics' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(getMetrics());

          } else if (req.url === '/.well-known/mcp-configuration' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              mcp_version: '2025-03-26',
              server_name: config.name,
              server_version: config.version,
              capabilities: ['tools'],
              transport: ['streamable-http'],
              endpoints: {
                mcp: '/mcp',
                health: '/health'
              }
            }));

          } else if (req.url === '/mcp' && req.method === 'POST') {
            // MCP JSON-RPC endpoint
            try {
              const body = await parseBody(req);

              let rpcRequest: JsonRpcRequest;
              try {
                rpcRequest = JSON.parse(body);
              } catch {
                sendJsonRpcError(res, null, MCP_ERROR_CODES.PARSE_ERROR, 'Invalid JSON');
                recordRequest(Date.now() - start);
                return;
              }

              // Validate JSON-RPC structure
              if (rpcRequest.jsonrpc !== '2.0' || !rpcRequest.method) {
                sendJsonRpcError(res, rpcRequest.id ?? null, MCP_ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC request');
                recordRequest(Date.now() - start);
                return;
              }

              await handleMCPRequest(req as http.IncomingMessage & AuthenticatedRequest, res, rpcRequest);

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error({ error: errorMessage }, 'MCP request failed');
              sendJsonRpcError(res, null, MCP_ERROR_CODES.INTERNAL_ERROR, 'Internal server error');
            }

          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
          }

          recordRequest(Date.now() - start);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error: errorMessage }, 'Unhandled server error');

          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
          recordRequest(Date.now() - start);
        }
      });

      server.listen(port, () => resolve(server));
    }),

    tools
  };
}
