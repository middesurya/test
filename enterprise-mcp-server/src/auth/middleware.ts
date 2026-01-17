import { IncomingMessage, ServerResponse } from 'http';
import { validateToken } from './oauth-pkce';
import { logger } from '../utils/logger';

export function createAuthMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === '/health' || req.url?.startsWith('/.well-known')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing authorization' }));
      return;
    }

    const payload = validateToken(authHeader.slice(7));
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return;
    }

    (req as any).user = { id: payload.sub, scopes: payload.scope };
    next();
  };
}
