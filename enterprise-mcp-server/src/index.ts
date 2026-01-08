import { createServer } from './server';
import { createAuthMiddleware } from './auth/middleware';
import { exampleTool } from './tools/example-tool';
import { fetchUserTool } from './tools/fetch-user';
import { logger } from './utils/logger';

const server = createServer({
  name: 'enterprise-mcp-server',
  version: '1.0.0'
});

// Apply security middleware
server.use(createAuthMiddleware());

// Register tools
server.registerTool(exampleTool);
server.registerTool(fetchUserTool);

// Start server
const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port).then(() => {
  logger.info({ port }, 'enterprise-mcp-server Enterprise MCP server started');
}).catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
