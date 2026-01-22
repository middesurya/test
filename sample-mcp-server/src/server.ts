import http from 'http';
import { Tool } from './types';
import { logger } from './utils/logger';
import { corsMiddleware, healthHandler, wellKnownHandler } from './middleware';

interface ServerConfig {
  name: string;
  version: string;
  description?: string;
}

export function createServer(config: ServerConfig) {
  const tools = new Map<string, Tool<any, any>>();

  const registerTool = (tool: Tool<any, any>): void => {
    tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  };

  const handleToolCall = async (toolName: string, input: unknown): Promise<unknown> => {
    const tool = tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const startTime = Date.now();
    logger.info({ tool: toolName, message: 'Executing tool' });

    try {
      const result = await tool.execute(input);
      logger.info({ tool: toolName, duration: Date.now() - startTime, message: 'Tool completed' });
      return result;
    } catch (error) {
      logger.error({ tool: toolName, error, message: 'Tool execution failed' });
      throw error;
    }
  };

  const getCapabilities = () => ({
    name: config.name,
    version: config.version,
    description: config.description,
    transport: ['streamable-http'],
    tools: Array.from(tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  });

  const listen = (port: number): Promise<http.Server> => {
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        // Apply CORS
        corsMiddleware(req, res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Route handling
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        if (url.pathname === '/health' || url.pathname === '/ready') {
          return healthHandler(req, res);
        }

        if (url.pathname === '/.well-known/mcp-configuration') {
          return wellKnownHandler(req, res, getCapabilities());
        }

        if (url.pathname === '/mcp' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            // Safely parse JSON body
            let parsed: { method: string; params?: any };
            try {
              parsed = JSON.parse(body);
            } catch (parseError) {
              logger.error({ error: parseError, message: 'Invalid JSON in request' });
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error: Invalid JSON' }
              }));
              return;
            }

            try {
              const { method, params } = parsed;

              if (method === 'tools/list') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tools: getCapabilities().tools }));
                return;
              }

              if (method === 'tools/call') {
                const result = await handleToolCall(params.name, params.arguments);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ result }));
                return;
              }

              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unknown method' }));
            } catch (error) {
              logger.error({ error, message: 'Request handling error' });
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal error' }
              }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      server.listen(port, () => resolve(server));
    });
  };

  return {
    registerTool,
    handleToolCall,
    getCapabilities,
    listen,
    tools
  };
}

export type MCPServer = ReturnType<typeof createServer>;
