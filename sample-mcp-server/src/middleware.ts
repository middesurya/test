import { IncomingMessage, ServerResponse } from 'http';

export function corsMiddleware(req: IncomingMessage, res: ServerResponse): void {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function healthHandler(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }));
}

export function wellKnownHandler(
  req: IncomingMessage,
  res: ServerResponse,
  capabilities: any
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    mcp_version: '2025-03-26',
    server_name: capabilities.name,
    server_version: capabilities.version,
    capabilities: ['tools'],
    transport: ['streamable-http'],
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    }
  }));
}
