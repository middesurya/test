import { createServer } from './server';
import { createStreamableHttpHandler } from './transport/streamable-http';
import { exampleTool } from './tools/example-tool';
import { logger } from './utils/logger';

const server = createServer({
  name: 'sample-mcp-server',
  version: '1.0.0',
  description: 'An MCP server built with mcp-gen'
});

// Register tools
server.registerTool(exampleTool);

// Create HTTP handler for serverless deployment
export const handler = createStreamableHttpHandler(server);

// Start standalone server if not in serverless environment
if (process.env.STANDALONE !== 'false') {
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port).then(() => {
    logger.info(`sample-mcp-server MCP server listening on port ${port}`);
    logger.info(`Transport: Streamable HTTP (2025-03-26 spec)`);
  }).catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
