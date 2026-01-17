// Discord Bot Template - TypeScript & Python
import { Template } from '../utils/template-loader';

export const discordBotTemplates: Record<string, Template> = {
  typescript: {
    name: 'discord-bot',
    description: 'MCP Server with Discord Bot Integration',
    features: ['TypeScript', 'Discord.js', 'Slash Commands', 'Event Handlers', 'MCP Tools'],
    files: [
      {
        path: 'src/index.ts',
        content: `import { MCPServer } from './server';
import { DiscordBot } from './discord/bot';
import { pingTool } from './tools/ping';
import { moderateTool } from './tools/moderate';
import { logger } from './utils/logger';
import 'dotenv/config';

const server = new MCPServer({
  name: '{{projectName}}',
  version: '1.0.0'
});

// Register MCP tools
server.registerTool(pingTool);
server.registerTool(moderateTool);

// Initialize Discord bot
const bot = new DiscordBot({
  mcpServer: server,
  prefix: '!'
});

// Start both services
async function main() {
  try {
    await server.start();
    logger.info('MCP server started');

    await bot.start();
    logger.info('Discord bot connected');
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
}

main();
`
      },
      {
        path: 'src/server.ts',
        content: `import { Tool } from './types';
import { logger } from './utils/logger';

interface ServerConfig {
  name: string;
  version: string;
}

export class MCPServer {
  private config: ServerConfig;
  private tools: Map<string, Tool<any, any>> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
  }

  registerTool<I, O>(tool: Tool<I, O>): void {
    this.tools.set(tool.name, tool);
    logger.debug(\`Registered tool: \${tool.name}\`);
  }

  async handleToolCall(toolName: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(\`Tool not found: \${toolName}\`);
    }

    logger.info(\`Executing tool: \${toolName}\`);
    const result = await tool.execute(input);
    logger.info(\`Tool \${toolName} completed\`);

    return result;
  }

  getTool(name: string): Tool<any, any> | undefined {
    return this.tools.get(name);
  }

  async start(): Promise<void> {
    logger.info(\`Starting \${this.config.name} v\${this.config.version}\`);
    logger.info(\`Registered tools: \${Array.from(this.tools.keys()).join(', ')}\`);
  }

  getToolList(): string[] {
    return Array.from(this.tools.keys());
  }
}
`
      },
      {
        path: 'src/types.ts',
        content: `export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  [key: string]: unknown;
}

export interface Tool<I extends ToolInput, O extends ToolOutput> {
  name: string;
  description: string;
  inputSchema: object;
  execute(input: I): Promise<O>;
}

export interface DiscordContext {
  userId: string;
  channelId: string;
  guildId?: string;
  username: string;
}
`
      },
      {
        path: 'src/discord/bot.ts',
        content: `import { Client, GatewayIntentBits, Events, Message, Interaction } from 'discord.js';
import { MCPServer } from '../server';
import { logger } from '../utils/logger';
import { registerSlashCommands } from './commands';

interface BotConfig {
  mcpServer: MCPServer;
  prefix: string;
}

export class DiscordBot {
  private client: Client;
  private mcpServer: MCPServer;
  private prefix: string;

  constructor(config: BotConfig) {
    this.mcpServer = config.mcpServer;
    this.prefix = config.prefix;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ]
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (client) => {
      logger.info(\`Discord bot logged in as \${client.user.tag}\`);
      registerSlashCommands(client, this.mcpServer);
    });

    this.client.on(Events.MessageCreate, (message) => this.handleMessage(message));
    this.client.on(Events.InteractionCreate, (interaction) => this.handleInteraction(interaction));

    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error:', error);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!message.content.startsWith(this.prefix)) return;

    const args = message.content.slice(this.prefix.length).trim().split(/\\s+/);
    const command = args.shift()?.toLowerCase();

    if (!command) return;

    // Map Discord commands to MCP tools
    const tool = this.mcpServer.getTool(command);
    if (tool) {
      try {
        const result = await this.mcpServer.handleToolCall(command, {
          args,
          context: {
            userId: message.author.id,
            channelId: message.channel.id,
            guildId: message.guild?.id,
            username: message.author.username
          }
        });
        await message.reply(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error(\`Command \${command} failed:\`, error);
        await message.reply('Command failed. Check logs for details.');
      }
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const tool = this.mcpServer.getTool(interaction.commandName);
    if (tool) {
      try {
        await interaction.deferReply();
        const result = await this.mcpServer.handleToolCall(interaction.commandName, {
          options: interaction.options.data,
          context: {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId,
            username: interaction.user.username
          }
        });
        await interaction.editReply(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error(\`Slash command \${interaction.commandName} failed:\`, error);
        await interaction.editReply('Command failed. Check logs for details.');
      }
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN environment variable is required');
    }
    await this.client.login(token);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }
}
`
      },
      {
        path: 'src/discord/commands.ts',
        content: `import { Client, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { MCPServer } from '../server';
import { logger } from '../utils/logger';

export async function registerSlashCommands(client: Client, mcpServer: MCPServer): Promise<void> {
  const commands = mcpServer.getToolList().map(toolName => {
    const tool = mcpServer.getTool(toolName);
    return new SlashCommandBuilder()
      .setName(toolName)
      .setDescription(tool?.description || \`Execute \${toolName}\`)
      .addStringOption(option =>
        option.setName('input')
          .setDescription('Input for the tool')
          .setRequired(false)
      );
  });

  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

  try {
    logger.info('Registering slash commands...');

    // Register globally (or use guildId for testing)
    const clientId = client.user?.id;
    if (clientId) {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands.map(c => c.toJSON()) }
      );
      logger.info(\`Registered \${commands.length} slash commands\`);
    }
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
  }
}
`
      },
      {
        path: 'src/tools/ping.ts',
        content: `import { Tool, ToolInput, ToolOutput, DiscordContext } from '../types';

interface PingInput extends ToolInput {
  context: DiscordContext;
}

interface PingOutput extends ToolOutput {
  message: string;
  latency: number;
  timestamp: string;
}

export const pingTool: Tool<PingInput, PingOutput> = {
  name: 'ping',
  description: 'Check bot latency and responsiveness',

  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        description: 'Discord context (auto-populated)'
      }
    }
  },

  async execute(input: PingInput): Promise<PingOutput> {
    const start = Date.now();
    // Simulate some processing
    await new Promise(resolve => setTimeout(resolve, 10));
    const latency = Date.now() - start;

    return {
      message: \`Pong! Hello \${input.context.username}!\`,
      latency,
      timestamp: new Date().toISOString()
    };
  }
};
`
      },
      {
        path: 'src/tools/moderate.ts',
        content: `import { Tool, ToolInput, ToolOutput, DiscordContext } from '../types';

interface ModerateInput extends ToolInput {
  args: string[];
  context: DiscordContext;
}

interface ModerateOutput extends ToolOutput {
  action: string;
  target?: string;
  reason?: string;
  success: boolean;
  message: string;
}

export const moderateTool: Tool<ModerateInput, ModerateOutput> = {
  name: 'moderate',
  description: 'Moderation actions (warn, mute, kick, ban)',

  inputSchema: {
    type: 'object',
    properties: {
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments: [action, target, ...reason]'
      },
      context: {
        type: 'object',
        description: 'Discord context'
      }
    },
    required: ['args', 'context']
  },

  async execute(input: ModerateInput): Promise<ModerateOutput> {
    const [action, target, ...reasonParts] = input.args;
    const reason = reasonParts.join(' ') || 'No reason provided';

    // TODO: Implement actual moderation logic with Discord API
    // This is a stub that demonstrates the pattern

    const validActions = ['warn', 'mute', 'kick', 'ban'];
    if (!validActions.includes(action)) {
      return {
        action: action || 'unknown',
        success: false,
        message: \`Invalid action. Use: \${validActions.join(', ')}\`
      };
    }

    if (!target) {
      return {
        action,
        success: false,
        message: 'Please specify a target user'
      };
    }

    // Placeholder for actual implementation
    return {
      action,
      target,
      reason,
      success: true,
      message: \`[DEMO] Would \${action} user \${target} for: \${reason}\`
    };
  }
};
`
      },
      {
        path: 'src/utils/logger.ts',
        content: `type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ') : '';
    return \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\${formattedArgs}\`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
`
      },
      {
        path: 'tests/tools/ping.test.ts',
        content: `import { pingTool } from '../../src/tools/ping';

describe('Ping Tool', () => {
  it('should return pong with latency', async () => {
    const input = {
      context: {
        userId: '123',
        channelId: '456',
        guildId: '789',
        username: 'testuser'
      }
    };

    const result = await pingTool.execute(input);

    expect(result.message).toContain('Pong!');
    expect(result.message).toContain('testuser');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
  });
});
`
      },
      {
        path: 'tests/tools/moderate.test.ts',
        content: `import { moderateTool } from '../../src/tools/moderate';

describe('Moderate Tool', () => {
  const mockContext = {
    userId: '123',
    channelId: '456',
    guildId: '789',
    username: 'moderator'
  };

  it('should accept valid moderation action', async () => {
    const input = {
      args: ['warn', '@user123', 'spamming'],
      context: mockContext
    };

    const result = await moderateTool.execute(input);

    expect(result.success).toBe(true);
    expect(result.action).toBe('warn');
    expect(result.target).toBe('@user123');
    expect(result.reason).toBe('spamming');
  });

  it('should reject invalid action', async () => {
    const input = {
      args: ['invalid-action', '@user123'],
      context: mockContext
    };

    const result = await moderateTool.execute(input);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid action');
  });

  it('should require target user', async () => {
    const input = {
      args: ['ban'],
      context: mockContext
    };

    const result = await moderateTool.execute(input);

    expect(result.success).toBe(false);
    expect(result.message).toContain('specify a target');
  });
});
`
      },
      {
        path: 'tests/mocks/llm-mock.ts',
        content: `/**
 * LLM Mock Utilities for Deterministic Testing
 *
 * This solves the "vibe-testing" problem where AI responses are non-deterministic.
 * Use these mocks to test your MCP tools without calling actual LLMs.
 */

export interface MockLLMResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export class LLMMock {
  private responses: Map<string, MockLLMResponse[]> = new Map();
  private callHistory: Array<{ prompt: string; response: MockLLMResponse }> = [];

  /**
   * Register a mock response for a specific prompt pattern
   */
  when(promptPattern: string | RegExp): MockResponseBuilder {
    return new MockResponseBuilder(this, promptPattern);
  }

  /**
   * Add a response to the queue for a pattern
   */
  addResponse(pattern: string, response: MockLLMResponse): void {
    const key = pattern.toString();
    const existing = this.responses.get(key) || [];
    existing.push(response);
    this.responses.set(key, existing);
  }

  /**
   * Simulate an LLM call with mocked responses
   */
  async complete(prompt: string): Promise<MockLLMResponse> {
    for (const [pattern, responses] of this.responses.entries()) {
      const regex = pattern.startsWith('/')
        ? new RegExp(pattern.slice(1, -1))
        : new RegExp(pattern, 'i');

      if (regex.test(prompt)) {
        const response = responses.shift() || {
          content: '[Mock] No more responses queued',
          finishReason: 'stop' as const
        };
        this.callHistory.push({ prompt, response });
        return response;
      }
    }

    // Default response if no pattern matches
    const defaultResponse: MockLLMResponse = {
      content: '[Mock] Unmatched prompt - add a mock response',
      finishReason: 'stop'
    };
    this.callHistory.push({ prompt, response: defaultResponse });
    return defaultResponse;
  }

  /**
   * Get the history of all calls made
   */
  getCallHistory(): Array<{ prompt: string; response: MockLLMResponse }> {
    return [...this.callHistory];
  }

  /**
   * Reset all mocks and history
   */
  reset(): void {
    this.responses.clear();
    this.callHistory = [];
  }

  /**
   * Verify a specific call was made
   */
  verifyCalled(promptPattern: string | RegExp): boolean {
    const regex = typeof promptPattern === 'string'
      ? new RegExp(promptPattern, 'i')
      : promptPattern;
    return this.callHistory.some(call => regex.test(call.prompt));
  }
}

class MockResponseBuilder {
  constructor(
    private mock: LLMMock,
    private pattern: string | RegExp
  ) {}

  thenReturn(response: Partial<MockLLMResponse>): LLMMock {
    this.mock.addResponse(this.pattern.toString(), {
      content: response.content || '',
      toolCalls: response.toolCalls,
      finishReason: response.finishReason || 'stop'
    });
    return this.mock;
  }

  thenCallTool(toolName: string, args: Record<string, unknown>): LLMMock {
    return this.thenReturn({
      content: '',
      toolCalls: [{ name: toolName, arguments: args }],
      finishReason: 'tool_calls'
    });
  }
}

// Singleton for easy access
export const llmMock = new LLMMock();

/**
 * Example usage in tests:
 *
 * beforeEach(() => {
 *   llmMock.reset();
 * });
 *
 * it('should call the search tool', async () => {
 *   llmMock
 *     .when('find information about')
 *     .thenCallTool('search', { query: 'test' });
 *
 *   const result = await myAgent.process('find information about cats');
 *
 *   expect(llmMock.verifyCalled('find information')).toBe(true);
 * });
 */
`
      },
      {
        path: 'package.json',
        content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "{{projectDescription}}",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  },
  "author": "{{author}}",
  "license": "MIT",
  "dependencies": {
    "discord.js": "^14.14.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0"
  }
}
`
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
`
      },
      {
        path: '.env.example',
        content: `# Discord Bot Configuration
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id

# Optional: For guild-specific commands (faster updates during dev)
DISCORD_GUILD_ID=your-test-server-id

# Logging
LOG_LEVEL=info
NODE_ENV=development
`
      },
      {
        path: 'README.md',
        content: `# {{projectName}}

{{projectDescription}}

A Discord bot powered by MCP (Model Context Protocol) for building AI-enhanced Discord experiences.

## Features

- Discord.js v14 integration
- Slash command support
- MCP tool system for modular functionality
- Built-in moderation tools
- LLM mock utilities for testing

## Quick Start

### 1. Setup Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable required intents (Server Members, Message Content)

### 2. Configure Environment

\`\`\`bash
cp .env.example .env
# Edit .env with your bot token
\`\`\`

### 3. Install & Run

\`\`\`bash
npm install
npm run dev
\`\`\`

### 4. Invite Bot to Server

Use this URL (replace CLIENT_ID):
\`\`\`
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| \`!ping\` | Check bot latency |
| \`!moderate <action> <user> [reason]\` | Moderation actions |

Slash commands are automatically registered from MCP tools.

## Adding New Tools

1. Create a tool in \`src/tools/\`:

\`\`\`typescript
import { Tool, ToolInput, ToolOutput } from '../types';

export const myTool: Tool<MyInput, MyOutput> = {
  name: 'mytool',
  description: 'What it does',
  inputSchema: { /* JSON Schema */ },
  async execute(input) {
    // Your logic here
    return { result: 'done' };
  }
};
\`\`\`

2. Register in \`src/index.ts\`:

\`\`\`typescript
import { myTool } from './tools/mytool';
server.registerTool(myTool);
\`\`\`

## Testing with LLM Mocks

\`\`\`typescript
import { llmMock } from './tests/mocks/llm-mock';

beforeEach(() => llmMock.reset());

it('should handle AI responses deterministically', async () => {
  llmMock
    .when('analyze this')
    .thenReturn({ content: 'Analysis complete' });

  // Your test here
});
\`\`\`

## Project Structure

\`\`\`
{{projectName}}/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server
│   ├── discord/
│   │   ├── bot.ts         # Discord client
│   │   └── commands.ts    # Slash command registration
│   ├── tools/             # MCP tools
│   └── utils/
├── tests/
│   ├── tools/             # Tool tests
│   └── mocks/
│       └── llm-mock.ts    # LLM mocking utilities
└── mcp-spec.json
\`\`\`

## License

MIT
`
      },
      {
        path: '.gitignore',
        content: `# Dependencies
node_modules/

# Build
dist/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Test coverage
coverage/
`
      }
    ]
  },
  python: {
    name: 'discord-bot',
    description: 'MCP Server with Discord Bot Integration (Python)',
    features: ['Python', 'discord.py', 'Slash Commands', 'Event Handlers', 'MCP Tools'],
    files: [
      {
        path: 'src/__init__.py',
        content: ''
      },
      {
        path: 'src/main.py',
        content: `import asyncio
import os
from dotenv import load_dotenv
from src.server import MCPServer
from src.discord.bot import DiscordBot
from src.tools.ping import ping_tool
from src.tools.moderate import moderate_tool
from src.utils.logger import logger

load_dotenv()

async def main():
    # Initialize MCP server
    server = MCPServer(
        name="{{projectName}}",
        version="1.0.0"
    )

    # Register tools
    server.register_tool(ping_tool)
    server.register_tool(moderate_tool)

    # Initialize Discord bot
    bot = DiscordBot(mcp_server=server, prefix="!")

    # Start services
    try:
        server.start()
        logger.info("MCP server started")

        token = os.getenv("DISCORD_TOKEN")
        if not token:
            raise ValueError("DISCORD_TOKEN environment variable required")

        await bot.start(token)
    except Exception as e:
        logger.error(f"Failed to start: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())
`
      },
      {
        path: 'src/server.py',
        content: `from typing import Dict, Any, Optional
from src.utils.logger import logger

class MCPServer:
    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self.tools: Dict[str, Dict[str, Any]] = {}

    def register_tool(self, tool: Dict[str, Any]) -> None:
        self.tools[tool["name"]] = tool
        logger.debug(f"Registered tool: {tool['name']}")

    async def handle_tool_call(self, tool_name: str, input_data: Any) -> Any:
        tool = self.tools.get(tool_name)
        if not tool:
            raise ValueError(f"Tool not found: {tool_name}")

        logger.info(f"Executing tool: {tool_name}")
        result = await tool["execute"](input_data)
        logger.info(f"Tool {tool_name} completed")

        return result

    def get_tool(self, name: str) -> Optional[Dict[str, Any]]:
        return self.tools.get(name)

    def start(self) -> None:
        logger.info(f"Starting {self.name} v{self.version}")
        logger.info(f"Registered tools: {', '.join(self.tools.keys())}")

    def get_tool_list(self) -> list:
        return list(self.tools.keys())
`
      },
      {
        path: 'src/discord/__init__.py',
        content: ''
      },
      {
        path: 'src/discord/bot.py',
        content: `import discord
from discord.ext import commands
from discord import app_commands
from src.server import MCPServer
from src.utils.logger import logger

class DiscordBot(commands.Bot):
    def __init__(self, mcp_server: MCPServer, prefix: str = "!"):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True

        super().__init__(command_prefix=prefix, intents=intents)
        self.mcp_server = mcp_server

    async def setup_hook(self) -> None:
        # Sync slash commands
        await self.tree.sync()
        logger.info("Slash commands synced")

    async def on_ready(self) -> None:
        logger.info(f"Discord bot logged in as {self.user}")

        # Register slash commands for each MCP tool
        for tool_name in self.mcp_server.get_tool_list():
            tool = self.mcp_server.get_tool(tool_name)
            if tool:
                @app_commands.command(name=tool_name, description=tool.get("description", f"Execute {tool_name}"))
                async def tool_command(interaction: discord.Interaction, input_text: str = ""):
                    await self._handle_tool_command(interaction, tool_name, input_text)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        await self.process_commands(message)

        # Handle prefix commands mapped to MCP tools
        if message.content.startswith(self.command_prefix):
            parts = message.content[len(self.command_prefix):].strip().split()
            if parts:
                command = parts[0].lower()
                args = parts[1:]

                tool = self.mcp_server.get_tool(command)
                if tool:
                    try:
                        context = {
                            "user_id": str(message.author.id),
                            "channel_id": str(message.channel.id),
                            "guild_id": str(message.guild.id) if message.guild else None,
                            "username": message.author.name
                        }
                        result = await self.mcp_server.handle_tool_call(
                            command,
                            {"args": args, "context": context}
                        )
                        await message.reply(str(result))
                    except Exception as e:
                        logger.error(f"Command {command} failed: {e}")
                        await message.reply("Command failed. Check logs.")

    async def _handle_tool_command(self, interaction: discord.Interaction, tool_name: str, input_text: str) -> None:
        await interaction.response.defer()
        try:
            context = {
                "user_id": str(interaction.user.id),
                "channel_id": str(interaction.channel_id),
                "guild_id": str(interaction.guild_id) if interaction.guild_id else None,
                "username": interaction.user.name
            }
            result = await self.mcp_server.handle_tool_call(
                tool_name,
                {"input": input_text, "context": context}
            )
            await interaction.followup.send(str(result))
        except Exception as e:
            logger.error(f"Slash command {tool_name} failed: {e}")
            await interaction.followup.send("Command failed.")
`
      },
      {
        path: 'src/tools/__init__.py',
        content: ''
      },
      {
        path: 'src/tools/ping.py',
        content: `import time
from datetime import datetime
from typing import TypedDict, Any

class Context(TypedDict):
    user_id: str
    channel_id: str
    guild_id: str | None
    username: str

class PingInput(TypedDict):
    context: Context

class PingOutput(TypedDict):
    message: str
    latency: float
    timestamp: str

async def execute(input_data: PingInput) -> PingOutput:
    start = time.time()
    # Simulate processing
    await asyncio.sleep(0.01)
    latency = (time.time() - start) * 1000  # ms

    username = input_data.get("context", {}).get("username", "User")

    return {
        "message": f"Pong! Hello {username}!",
        "latency": round(latency, 2),
        "timestamp": datetime.now().isoformat()
    }

import asyncio

ping_tool = {
    "name": "ping",
    "description": "Check bot latency and responsiveness",
    "input_schema": {
        "type": "object",
        "properties": {
            "context": {"type": "object", "description": "Discord context"}
        }
    },
    "execute": execute
}
`
      },
      {
        path: 'src/tools/moderate.py',
        content: `from typing import TypedDict, List, Any, Optional

class Context(TypedDict):
    user_id: str
    channel_id: str
    guild_id: str | None
    username: str

class ModerateInput(TypedDict):
    args: List[str]
    context: Context

class ModerateOutput(TypedDict):
    action: str
    target: Optional[str]
    reason: Optional[str]
    success: bool
    message: str

async def execute(input_data: ModerateInput) -> ModerateOutput:
    args = input_data.get("args", [])

    action = args[0] if len(args) > 0 else None
    target = args[1] if len(args) > 1 else None
    reason = " ".join(args[2:]) if len(args) > 2 else "No reason provided"

    valid_actions = ["warn", "mute", "kick", "ban"]

    if action not in valid_actions:
        return {
            "action": action or "unknown",
            "target": None,
            "reason": None,
            "success": False,
            "message": f"Invalid action. Use: {', '.join(valid_actions)}"
        }

    if not target:
        return {
            "action": action,
            "target": None,
            "reason": None,
            "success": False,
            "message": "Please specify a target user"
        }

    # Placeholder - implement actual moderation
    return {
        "action": action,
        "target": target,
        "reason": reason,
        "success": True,
        "message": f"[DEMO] Would {action} user {target} for: {reason}"
    }

moderate_tool = {
    "name": "moderate",
    "description": "Moderation actions (warn, mute, kick, ban)",
    "input_schema": {
        "type": "object",
        "properties": {
            "args": {"type": "array", "items": {"type": "string"}},
            "context": {"type": "object"}
        },
        "required": ["args", "context"]
    },
    "execute": execute
}
`
      },
      {
        path: 'src/utils/__init__.py',
        content: ''
      },
      {
        path: 'src/utils/logger.py',
        content: `import logging
import os

class Logger:
    def __init__(self, level: str = "INFO"):
        self.logger = logging.getLogger("mcp-discord-bot")
        self.logger.setLevel(getattr(logging, level.upper()))

        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "[%(asctime)s] [%(levelname)s] %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S"
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def debug(self, message: str, *args) -> None:
        self.logger.debug(message, *args)

    def info(self, message: str, *args) -> None:
        self.logger.info(message, *args)

    def warn(self, message: str, *args) -> None:
        self.logger.warning(message, *args)

    def error(self, message: str, *args) -> None:
        self.logger.error(message, *args)

logger = Logger(os.getenv("LOG_LEVEL", "INFO"))
`
      },
      {
        path: 'tests/__init__.py',
        content: ''
      },
      {
        path: 'tests/mocks/__init__.py',
        content: ''
      },
      {
        path: 'tests/mocks/llm_mock.py',
        content: `"""
LLM Mock Utilities for Deterministic Testing

This solves the "vibe-testing" problem where AI responses are non-deterministic.
Use these mocks to test your MCP tools without calling actual LLMs.
"""

import re
from typing import Dict, List, Optional, Any, Pattern
from dataclasses import dataclass, field

@dataclass
class MockLLMResponse:
    content: str = ""
    tool_calls: Optional[List[Dict[str, Any]]] = None
    finish_reason: str = "stop"  # 'stop', 'tool_calls', 'length'

class LLMMock:
    def __init__(self):
        self._responses: Dict[str, List[MockLLMResponse]] = {}
        self._call_history: List[Dict[str, Any]] = []

    def when(self, prompt_pattern: str) -> 'MockResponseBuilder':
        """Register a mock response for a specific prompt pattern."""
        return MockResponseBuilder(self, prompt_pattern)

    def add_response(self, pattern: str, response: MockLLMResponse) -> None:
        """Add a response to the queue for a pattern."""
        if pattern not in self._responses:
            self._responses[pattern] = []
        self._responses[pattern].append(response)

    async def complete(self, prompt: str) -> MockLLMResponse:
        """Simulate an LLM call with mocked responses."""
        for pattern, responses in self._responses.items():
            regex = re.compile(pattern, re.IGNORECASE)
            if regex.search(prompt):
                if responses:
                    response = responses.pop(0)
                else:
                    response = MockLLMResponse(
                        content="[Mock] No more responses queued"
                    )
                self._call_history.append({"prompt": prompt, "response": response})
                return response

        # Default response
        default = MockLLMResponse(content="[Mock] Unmatched prompt")
        self._call_history.append({"prompt": prompt, "response": default})
        return default

    def get_call_history(self) -> List[Dict[str, Any]]:
        """Get the history of all calls made."""
        return self._call_history.copy()

    def reset(self) -> None:
        """Reset all mocks and history."""
        self._responses.clear()
        self._call_history.clear()

    def verify_called(self, prompt_pattern: str) -> bool:
        """Verify a specific call was made."""
        regex = re.compile(prompt_pattern, re.IGNORECASE)
        return any(regex.search(call["prompt"]) for call in self._call_history)

class MockResponseBuilder:
    def __init__(self, mock: LLMMock, pattern: str):
        self._mock = mock
        self._pattern = pattern

    def then_return(self, content: str = "", **kwargs) -> LLMMock:
        """Return a text response."""
        response = MockLLMResponse(
            content=content,
            tool_calls=kwargs.get("tool_calls"),
            finish_reason=kwargs.get("finish_reason", "stop")
        )
        self._mock.add_response(self._pattern, response)
        return self._mock

    def then_call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> LLMMock:
        """Return a tool call response."""
        response = MockLLMResponse(
            content="",
            tool_calls=[{"name": tool_name, "arguments": arguments}],
            finish_reason="tool_calls"
        )
        self._mock.add_response(self._pattern, response)
        return self._mock

# Singleton for easy access
llm_mock = LLMMock()

# Example usage:
#
# @pytest.fixture(autouse=True)
# def reset_mocks():
#     llm_mock.reset()
#     yield
#
# async def test_tool_call():
#     llm_mock.when("search for").then_call_tool("search", {"query": "test"})
#
#     result = await my_agent.process("search for cats")
#
#     assert llm_mock.verify_called("search for")
`
      },
      {
        path: 'tests/test_ping.py',
        content: `import pytest
from src.tools.ping import execute

@pytest.mark.asyncio
async def test_ping_returns_pong():
    input_data = {
        "context": {
            "user_id": "123",
            "channel_id": "456",
            "guild_id": "789",
            "username": "testuser"
        }
    }

    result = await execute(input_data)

    assert "Pong" in result["message"]
    assert "testuser" in result["message"]
    assert result["latency"] >= 0
    assert "timestamp" in result
`
      },
      {
        path: 'tests/test_moderate.py',
        content: `import pytest
from src.tools.moderate import execute

@pytest.mark.asyncio
async def test_valid_moderation():
    input_data = {
        "args": ["warn", "@user123", "spamming"],
        "context": {"user_id": "123", "channel_id": "456", "username": "mod"}
    }

    result = await execute(input_data)

    assert result["success"] is True
    assert result["action"] == "warn"
    assert result["target"] == "@user123"

@pytest.mark.asyncio
async def test_invalid_action():
    input_data = {
        "args": ["invalid"],
        "context": {"user_id": "123", "channel_id": "456", "username": "mod"}
    }

    result = await execute(input_data)

    assert result["success"] is False
    assert "Invalid action" in result["message"]
`
      },
      {
        path: 'requirements.txt',
        content: `# Discord
discord.py>=2.3.0
python-dotenv>=1.0.0

# Development
pytest>=7.4.0
pytest-asyncio>=0.21.0
`
      },
      {
        path: '.env.example',
        content: `# Discord Bot Configuration
DISCORD_TOKEN=your-bot-token-here

# Logging
LOG_LEVEL=info
`
      },
      {
        path: 'README.md',
        content: `# {{projectName}}

{{projectDescription}}

A Discord bot powered by MCP (Model Context Protocol).

## Setup

1. Create Discord bot at [Developer Portal](https://discord.com/developers/applications)
2. Copy token to \`.env\`
3. Install and run:

\`\`\`bash
pip install -r requirements.txt
cp .env.example .env
python -m src.main
\`\`\`

## Commands

- \`!ping\` - Check latency
- \`!moderate <action> <user> [reason]\` - Moderation

## Testing

\`\`\`bash
pytest
\`\`\`

Uses LLM mocking for deterministic tests - see \`tests/mocks/llm_mock.py\`.
`
      },
      {
        path: '.gitignore',
        content: `__pycache__/
*.py[cod]
.env
venv/
.vscode/
.idea/
*.log
`
      }
    ]
  }
};
