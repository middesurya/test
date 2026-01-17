// API Wrapper Template - TypeScript & Python
// Features: HTTP Client, Rate Limiting, Caching, Error Handling
import { Template } from '../utils/template-loader';

export const apiWrapperTemplates: Record<string, Template> = {
  typescript: {
    name: 'api-wrapper',
    description: 'MCP Server that wraps an external API',
    features: ['TypeScript', 'HTTP Client', 'Rate Limiting', 'Caching', 'Retry Logic'],
    files: [
      {
        path: 'src/index.ts',
        content: `import { MCPServer } from './server';
import { fetchTool } from './tools/fetch';
import { searchTool } from './tools/search';
import { logger } from './utils/logger';
import 'dotenv/config';

const server = new MCPServer({
  name: '{{projectName}}',
  version: '1.0.0'
});

// Register API tools
server.registerTool(fetchTool);
server.registerTool(searchTool);

// Start server
server.start().then(() => {
  logger.info('{{projectName}} API wrapper started');
}).catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
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

export interface APIResponse<T = unknown> {
  data: T;
  status: number;
  cached: boolean;
  rateLimited: boolean;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}
`
      },
      {
        path: 'src/api/client.ts',
        content: `import { logger } from '../utils/logger';
import { RateLimiter } from './rate-limiter';
import { Cache } from './cache';

interface ClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  cache?: {
    ttlMs: number;
    maxSize: number;
  };
  retry?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  skipCache?: boolean;
  timeout?: number;
}

interface APIResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached: boolean;
}

export class APIClient {
  private baseURL: string;
  private apiKey?: string;
  private timeout: number;
  private rateLimiter: RateLimiter;
  private cache: Cache<APIResponse<unknown>>;
  private maxRetries: number;
  private baseDelayMs: number;

  constructor(config: ClientConfig) {
    this.baseURL = config.baseURL.replace(/\\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;

    this.rateLimiter = new RateLimiter(
      config.rateLimit?.maxRequests || 100,
      config.rateLimit?.windowMs || 60000
    );

    this.cache = new Cache(
      config.cache?.ttlMs || 300000,  // 5 min default
      config.cache?.maxSize || 1000
    );

    this.maxRetries = config.retry?.maxRetries || 3;
    this.baseDelayMs = config.retry?.baseDelayMs || 1000;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<APIResponse<T>> {
    const method = options.method || 'GET';
    const url = \`\${this.baseURL}\${endpoint}\`;
    const cacheKey = \`\${method}:\${url}:\${JSON.stringify(options.body || {})}\`;

    // Check cache for GET requests
    if (method === 'GET' && !options.skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug(\`Cache hit: \${endpoint}\`);
        return { ...cached, cached: true } as APIResponse<T>;
      }
    }

    // Check rate limit
    await this.rateLimiter.acquire();

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.apiKey) {
      headers['Authorization'] = \`Bearer \${this.apiKey}\`;
    }

    // Execute with retry
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          options.timeout || this.timeout
        );

        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Handle rate limiting from server
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
            logger.warn(\`Rate limited, waiting \${retryAfter}s\`);
            await this.sleep(retryAfter * 1000);
            continue;
          }

          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }

        const data = await response.json() as T;
        const result: APIResponse<T> = {
          data,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          cached: false
        };

        // Cache successful GET responses
        if (method === 'GET') {
          this.cache.set(cacheKey, result);
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        logger.warn(\`Request failed (attempt \${attempt + 1}/\${this.maxRetries + 1}): \${lastError.message}\`);

        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  async get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async delete<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default client instance (configure via environment)
export const apiClient = new APIClient({
  baseURL: process.env.API_BASE_URL || 'https://api.example.com',
  apiKey: process.env.API_KEY,
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
  }
});
`
      },
      {
        path: 'src/api/rate-limiter.ts',
        content: `import { logger } from '../utils/logger';

/**
 * Token bucket rate limiter with sliding window
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private windowMs: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.windowMs = windowMs;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token, waiting if necessary
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for a token
    logger.debug('Rate limit reached, waiting for token...');
    return new Promise(resolve => {
      this.queue.push(resolve);
      setTimeout(() => this.processQueue(), this.getWaitTime());
    });
  }

  /**
   * Try to acquire a token without waiting
   */
  tryAcquire(): boolean {
    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get time until next token is available
   */
  getWaitTime(): number {
    const elapsed = Date.now() - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / (this.windowMs / this.maxTokens));

    if (tokensToAdd > 0 || this.tokens > 0) {
      return 0;
    }

    return Math.ceil(this.windowMs / this.maxTokens);
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / (this.windowMs / this.maxTokens));

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  private processQueue(): void {
    this.refillTokens();

    while (this.tokens > 0 && this.queue.length > 0) {
      this.tokens--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), this.getWaitTime());
    }
  }
}
`
      },
      {
        path: 'src/api/cache.ts',
        content: `import { logger } from '../utils/logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL and LRU eviction
 */
export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;
  private maxSize: number;

  constructor(ttlMs: number = 300000, maxSize: number = 1000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(\`Cache evicted: \${oldestKey}\`);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.ttlMs)
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    // Clean expired entries and return count
    this.cleanup();
    return this.cache.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
`
      },
      {
        path: 'src/tools/fetch.ts',
        content: `import { Tool, ToolInput, ToolOutput } from '../types';
import { apiClient } from '../api/client';

interface FetchInput extends ToolInput {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

interface FetchOutput extends ToolOutput {
  data: unknown;
  status: number;
  cached: boolean;
  success: boolean;
  error?: string;
}

export const fetchTool: Tool<FetchInput, FetchOutput> = {
  name: 'fetch',
  description: 'Make HTTP requests to the configured API with rate limiting and caching',

  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'API endpoint path (e.g., /users/123)'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method (default: GET)'
      },
      body: {
        type: 'object',
        description: 'Request body for POST/PUT'
      },
      headers: {
        type: 'object',
        description: 'Additional headers'
      }
    },
    required: ['url']
  },

  async execute(input: FetchInput): Promise<FetchOutput> {
    try {
      const response = await apiClient.request(input.url, {
        method: input.method || 'GET',
        body: input.body,
        headers: input.headers
      });

      return {
        data: response.data,
        status: response.status,
        cached: response.cached,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        status: 0,
        cached: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
`
      },
      {
        path: 'src/tools/search.ts',
        content: `import { Tool, ToolInput, ToolOutput } from '../types';
import { apiClient } from '../api/client';

interface SearchInput extends ToolInput {
  query: string;
  filters?: Record<string, unknown>;
  page?: number;
  limit?: number;
}

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  score?: number;
  [key: string]: unknown;
}

interface SearchOutput extends ToolOutput {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  cached: boolean;
  success: boolean;
  error?: string;
}

export const searchTool: Tool<SearchInput, SearchOutput> = {
  name: 'search',
  description: 'Search the API with query and filters',

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      filters: {
        type: 'object',
        description: 'Optional filters'
      },
      page: {
        type: 'number',
        description: 'Page number (default: 1)'
      },
      limit: {
        type: 'number',
        description: 'Results per page (default: 10)'
      }
    },
    required: ['query']
  },

  async execute(input: SearchInput): Promise<SearchOutput> {
    const page = input.page || 1;
    const limit = input.limit || 10;

    try {
      // Build query string
      const params = new URLSearchParams({
        q: input.query,
        page: String(page),
        limit: String(limit)
      });

      if (input.filters) {
        Object.entries(input.filters).forEach(([key, value]) => {
          params.append(key, String(value));
        });
      }

      const response = await apiClient.get<{
        results: SearchResult[];
        total: number;
      }>(\`/search?\${params.toString()}\`);

      return {
        results: response.data.results || [],
        total: response.data.total || 0,
        page,
        limit,
        cached: response.cached,
        success: true
      };
    } catch (error) {
      return {
        results: [],
        total: 0,
        page,
        limit,
        cached: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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
        path: 'tests/api/client.test.ts',
        content: `import { APIClient } from '../../src/api/client';

// Mock fetch
global.fetch = jest.fn();

describe('APIClient', () => {
  let client: APIClient;

  beforeEach(() => {
    client = new APIClient({
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      rateLimit: { maxRequests: 10, windowMs: 1000 }
    });
    jest.clearAllMocks();
  });

  it('should make GET requests', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1, name: 'Test' }),
      headers: new Map()
    });

    const response = await client.get('/users/1');

    expect(response.data).toEqual({ id: 1, name: 'Test' });
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users/1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should cache GET responses', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cached: false }),
      headers: new Map()
    });

    // First request
    const response1 = await client.get('/cached');
    expect(response1.cached).toBe(false);

    // Second request should be cached
    const response2 = await client.get('/cached');
    expect(response2.cached).toBe(true);

    // Only one fetch call
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    (fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
        headers: new Map()
      });

    const response = await client.get('/retry-test');

    expect(response.data).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
`
      },
      {
        path: 'tests/api/rate-limiter.test.ts',
        content: `import { RateLimiter } from '../../src/api/rate-limiter';

describe('RateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new RateLimiter(5, 1000);

    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire()).toBe(true);
    }

    expect(limiter.getAvailableTokens()).toBe(0);
  });

  it('should block when limit exceeded', () => {
    const limiter = new RateLimiter(2, 1000);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('should refill tokens over time', async () => {
    const limiter = new RateLimiter(10, 100);

    // Use all tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryAcquire();
    }
    expect(limiter.getAvailableTokens()).toBe(0);

    // Wait for refill
    await new Promise(r => setTimeout(r, 150));

    expect(limiter.getAvailableTokens()).toBeGreaterThan(0);
  });
});
`
      },
      {
        path: 'tests/api/cache.test.ts',
        content: `import { Cache } from '../../src/api/cache';

describe('Cache', () => {
  it('should store and retrieve values', () => {
    const cache = new Cache<string>(1000, 10);

    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should expire entries after TTL', async () => {
    const cache = new Cache<string>(50, 10);

    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    await new Promise(r => setTimeout(r, 100));

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should evict oldest when at capacity', () => {
    const cache = new Cache<string>(10000, 3);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Should evict key1

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key4')).toBe('value4');
  });
});
`
      },
      {
        path: 'tests/mocks/llm-mock.ts',
        content: `/**
 * LLM Mock Utilities for Deterministic Testing
 *
 * Eliminates "vibe-testing" by providing predictable AI responses.
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

  when(pattern: string | RegExp): MockResponseBuilder {
    return new MockResponseBuilder(this, pattern);
  }

  addResponse(pattern: string, response: MockLLMResponse): void {
    const key = pattern.toString();
    const existing = this.responses.get(key) || [];
    existing.push(response);
    this.responses.set(key, existing);
  }

  async complete(prompt: string): Promise<MockLLMResponse> {
    for (const [pattern, responses] of this.responses.entries()) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(prompt)) {
        const response = responses.shift() || {
          content: '[Mock] No more responses',
          finishReason: 'stop' as const
        };
        this.callHistory.push({ prompt, response });
        return response;
      }
    }

    const defaultResponse: MockLLMResponse = {
      content: '[Mock] Unmatched prompt',
      finishReason: 'stop'
    };
    this.callHistory.push({ prompt, response: defaultResponse });
    return defaultResponse;
  }

  getCallHistory() {
    return [...this.callHistory];
  }

  reset(): void {
    this.responses.clear();
    this.callHistory = [];
  }

  verifyCalled(pattern: string | RegExp): boolean {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    return this.callHistory.some(call => regex.test(call.prompt));
  }
}

class MockResponseBuilder {
  constructor(private mock: LLMMock, private pattern: string | RegExp) {}

  thenReturn(response: Partial<MockLLMResponse>): LLMMock {
    this.mock.addResponse(this.pattern.toString(), {
      content: response.content || '',
      toolCalls: response.toolCalls,
      finishReason: response.finishReason || 'stop'
    });
    return this.mock;
  }

  thenCallTool(name: string, args: Record<string, unknown>): LLMMock {
    return this.thenReturn({
      toolCalls: [{ name, arguments: args }],
      finishReason: 'tool_calls'
    });
  }
}

export const llmMock = new LLMMock();
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
        path: 'jest.config.js',
        content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov']
};
`
      },
      {
        path: '.env.example',
        content: `# API Configuration
API_BASE_URL=https://api.example.com
API_KEY=your-api-key-here

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
NODE_ENV=development
`
      },
      {
        path: 'README.md',
        content: `# {{projectName}}

{{projectDescription}}

An MCP server that wraps external APIs with built-in rate limiting, caching, and retry logic.

## Features

- **HTTP Client** with automatic error handling
- **Rate Limiting** using token bucket algorithm
- **Response Caching** with TTL and LRU eviction
- **Retry Logic** with exponential backoff
- **LLM Mocking** for deterministic testing

## Quick Start

\`\`\`bash
cp .env.example .env
# Edit .env with your API configuration
npm install
npm run dev
\`\`\`

## Tools

### \`fetch\`
Make HTTP requests to the configured API.

\`\`\`json
{
  "url": "/users/123",
  "method": "GET"
}
\`\`\`

### \`search\`
Search the API with query and filters.

\`\`\`json
{
  "query": "example",
  "filters": { "type": "user" },
  "page": 1,
  "limit": 10
}
\`\`\`

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| API_BASE_URL | Base URL for API | - |
| API_KEY | API authentication key | - |
| RATE_LIMIT_MAX | Max requests per window | 100 |
| RATE_LIMIT_WINDOW_MS | Rate limit window (ms) | 60000 |

## Testing

\`\`\`bash
npm test
\`\`\`

Uses LLM mocking for deterministic tests - see \`tests/mocks/llm-mock.ts\`.

## Project Structure

\`\`\`
{{projectName}}/
├── src/
│   ├── api/
│   │   ├── client.ts      # HTTP client
│   │   ├── rate-limiter.ts
│   │   └── cache.ts
│   ├── tools/
│   │   ├── fetch.ts
│   │   └── search.ts
│   └── utils/
├── tests/
│   ├── api/
│   └── mocks/
└── mcp-spec.json
\`\`\`

## License

MIT
`
      },
      {
        path: '.gitignore',
        content: `node_modules/
dist/
.env
.env.local
.vscode/
.idea/
*.log
coverage/
.DS_Store
`
      }
    ]
  },
  python: {
    name: 'api-wrapper',
    description: 'MCP Server that wraps an external API (Python)',
    features: ['Python', 'HTTPX Client', 'Rate Limiting', 'Caching', 'Retry Logic'],
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
from src.tools.fetch import fetch_tool
from src.tools.search import search_tool
from src.utils.logger import logger

load_dotenv()

async def main():
    server = MCPServer(
        name="{{projectName}}",
        version="1.0.0"
    )

    server.register_tool(fetch_tool)
    server.register_tool(search_tool)

    server.start()
    logger.info("{{projectName}} API wrapper started")

if __name__ == "__main__":
    asyncio.run(main())
`
      },
      {
        path: 'src/server.py',
        content: `from typing import Dict, Any
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

    def start(self) -> None:
        logger.info(f"Starting {self.name} v{self.version}")
        logger.info(f"Registered tools: {', '.join(self.tools.keys())}")

    def get_tool_list(self) -> list:
        return list(self.tools.keys())
`
      },
      {
        path: 'src/api/__init__.py',
        content: ''
      },
      {
        path: 'src/api/client.py',
        content: `import os
import asyncio
import httpx
from typing import Optional, Dict, Any
from src.api.rate_limiter import RateLimiter
from src.api.cache import Cache
from src.utils.logger import logger

class APIClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30,
        max_requests: int = 100,
        window_ms: int = 60000,
        cache_ttl: int = 300,
        max_retries: int = 3
    ):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.rate_limiter = RateLimiter(max_requests, window_ms)
        self.cache = Cache(ttl_seconds=cache_ttl)
        self.max_retries = max_retries

    async def request(
        self,
        endpoint: str,
        method: str = "GET",
        body: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        skip_cache: bool = False
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        cache_key = f"{method}:{url}:{body}"

        # Check cache for GET
        if method == "GET" and not skip_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.debug(f"Cache hit: {endpoint}")
                return {"data": cached, "cached": True, "status": 200}

        # Rate limit
        await self.rate_limiter.acquire()

        # Build headers
        req_headers = {"Content-Type": "application/json", **(headers or {})}
        if self.api_key:
            req_headers["Authorization"] = f"Bearer {self.api_key}"

        # Retry logic
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(
                        method,
                        url,
                        headers=req_headers,
                        json=body
                    )

                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", 1))
                        logger.warn(f"Rate limited, waiting {retry_after}s")
                        await asyncio.sleep(retry_after)
                        continue

                    response.raise_for_status()
                    data = response.json()

                    # Cache GET responses
                    if method == "GET":
                        self.cache.set(cache_key, data)

                    return {"data": data, "cached": False, "status": response.status_code}

            except Exception as e:
                last_error = e
                logger.warn(f"Request failed (attempt {attempt + 1}): {e}")
                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)

        raise last_error or Exception("Request failed")

    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request(endpoint, method="GET", **kwargs)

    async def post(self, endpoint: str, body: Dict, **kwargs) -> Dict[str, Any]:
        return await self.request(endpoint, method="POST", body=body, **kwargs)

# Default client
api_client = APIClient(
    base_url=os.getenv("API_BASE_URL", "https://api.example.com"),
    api_key=os.getenv("API_KEY"),
    max_requests=int(os.getenv("RATE_LIMIT_MAX", "100")),
    window_ms=int(os.getenv("RATE_LIMIT_WINDOW_MS", "60000"))
)
`
      },
      {
        path: 'src/api/rate_limiter.py',
        content: `import asyncio
import time
from typing import List, Callable

class RateLimiter:
    """Token bucket rate limiter."""

    def __init__(self, max_requests: int, window_ms: int):
        self.max_tokens = max_requests
        self.tokens = max_requests
        self.window_ms = window_ms
        self.last_refill = time.time() * 1000
        self._queue: List[asyncio.Future] = []

    async def acquire(self) -> None:
        self._refill()

        if self.tokens > 0:
            self.tokens -= 1
            return

        # Wait for token
        future = asyncio.get_event_loop().create_future()
        self._queue.append(future)

        await asyncio.sleep(self._get_wait_time() / 1000)
        self._process_queue()

        await future

    def try_acquire(self) -> bool:
        self._refill()
        if self.tokens > 0:
            self.tokens -= 1
            return True
        return False

    def _refill(self) -> None:
        now = time.time() * 1000
        elapsed = now - self.last_refill
        tokens_to_add = int(elapsed / (self.window_ms / self.max_tokens))

        if tokens_to_add > 0:
            self.tokens = min(self.max_tokens, self.tokens + tokens_to_add)
            self.last_refill = now

    def _get_wait_time(self) -> float:
        if self.tokens > 0:
            return 0
        return self.window_ms / self.max_tokens

    def _process_queue(self) -> None:
        self._refill()
        while self.tokens > 0 and self._queue:
            self.tokens -= 1
            future = self._queue.pop(0)
            if not future.done():
                future.set_result(None)
`
      },
      {
        path: 'src/api/cache.py',
        content: `import time
from typing import Optional, Dict, Any
from collections import OrderedDict

class Cache:
    """Simple LRU cache with TTL."""

    def __init__(self, ttl_seconds: int = 300, max_size: int = 1000):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self._cache:
            return None

        entry = self._cache[key]
        if time.time() > entry["expires_at"]:
            del self._cache[key]
            return None

        # Move to end (LRU)
        self._cache.move_to_end(key)
        return entry["value"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        if len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)

        self._cache[key] = {
            "value": value,
            "expires_at": time.time() + (ttl or self.ttl)
        }

    def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        self._cache.clear()

    def size(self) -> int:
        self._cleanup()
        return len(self._cache)

    def _cleanup(self) -> None:
        now = time.time()
        expired = [k for k, v in self._cache.items() if now > v["expires_at"]]
        for k in expired:
            del self._cache[k]
`
      },
      {
        path: 'src/tools/__init__.py',
        content: ''
      },
      {
        path: 'src/tools/fetch.py',
        content: `from typing import TypedDict, Optional, Dict, Any
from src.api.client import api_client

class FetchInput(TypedDict):
    url: str
    method: Optional[str]
    body: Optional[Dict]
    headers: Optional[Dict]

class FetchOutput(TypedDict):
    data: Any
    status: int
    cached: bool
    success: bool
    error: Optional[str]

async def execute(input_data: FetchInput) -> FetchOutput:
    try:
        response = await api_client.request(
            input_data["url"],
            method=input_data.get("method", "GET"),
            body=input_data.get("body"),
            headers=input_data.get("headers")
        )
        return {
            "data": response["data"],
            "status": response["status"],
            "cached": response["cached"],
            "success": True,
            "error": None
        }
    except Exception as e:
        return {
            "data": None,
            "status": 0,
            "cached": False,
            "success": False,
            "error": str(e)
        }

fetch_tool = {
    "name": "fetch",
    "description": "Make HTTP requests with rate limiting and caching",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE"]},
            "body": {"type": "object"},
            "headers": {"type": "object"}
        },
        "required": ["url"]
    },
    "execute": execute
}
`
      },
      {
        path: 'src/tools/search.py',
        content: `from typing import TypedDict, Optional, Dict, List, Any
from src.api.client import api_client
from urllib.parse import urlencode

class SearchInput(TypedDict):
    query: str
    filters: Optional[Dict]
    page: Optional[int]
    limit: Optional[int]

class SearchOutput(TypedDict):
    results: List[Dict]
    total: int
    page: int
    limit: int
    cached: bool
    success: bool
    error: Optional[str]

async def execute(input_data: SearchInput) -> SearchOutput:
    page = input_data.get("page", 1)
    limit = input_data.get("limit", 10)

    try:
        params = {"q": input_data["query"], "page": page, "limit": limit}
        if input_data.get("filters"):
            params.update(input_data["filters"])

        response = await api_client.get(f"/search?{urlencode(params)}")

        return {
            "results": response["data"].get("results", []),
            "total": response["data"].get("total", 0),
            "page": page,
            "limit": limit,
            "cached": response["cached"],
            "success": True,
            "error": None
        }
    except Exception as e:
        return {
            "results": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "cached": False,
            "success": False,
            "error": str(e)
        }

search_tool = {
    "name": "search",
    "description": "Search the API with query and filters",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "filters": {"type": "object"},
            "page": {"type": "number"},
            "limit": {"type": "number"}
        },
        "required": ["query"]
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
        self.logger = logging.getLogger("mcp-api-wrapper")
        self.logger.setLevel(getattr(logging, level.upper()))

        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "[%(asctime)s] [%(levelname)s] %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S"
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def debug(self, message: str) -> None:
        self.logger.debug(message)

    def info(self, message: str) -> None:
        self.logger.info(message)

    def warn(self, message: str) -> None:
        self.logger.warning(message)

    def error(self, message: str) -> None:
        self.logger.error(message)

logger = Logger(os.getenv("LOG_LEVEL", "INFO"))
`
      },
      {
        path: 'tests/__init__.py',
        content: ''
      },
      {
        path: 'tests/test_fetch.py',
        content: `import pytest
from unittest.mock import AsyncMock, patch
from src.tools.fetch import execute

@pytest.mark.asyncio
async def test_fetch_success():
    with patch("src.tools.fetch.api_client") as mock_client:
        mock_client.request = AsyncMock(return_value={
            "data": {"id": 1},
            "status": 200,
            "cached": False
        })

        result = await execute({"url": "/test"})

        assert result["success"] is True
        assert result["data"]["id"] == 1
`
      },
      {
        path: 'requirements.txt',
        content: `httpx>=0.25.0
python-dotenv>=1.0.0

# Development
pytest>=7.4.0
pytest-asyncio>=0.21.0
`
      },
      {
        path: '.env.example',
        content: `API_BASE_URL=https://api.example.com
API_KEY=your-api-key
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
LOG_LEVEL=info
`
      },
      {
        path: 'README.md',
        content: `# {{projectName}}

{{projectDescription}}

MCP server wrapping external APIs with rate limiting, caching, and retry logic.

## Setup

\`\`\`bash
pip install -r requirements.txt
cp .env.example .env
python -m src.main
\`\`\`

## Tools

- \`fetch\` - HTTP requests with caching
- \`search\` - Search with pagination

## Testing

\`\`\`bash
pytest
\`\`\`
`
      },
      {
        path: '.gitignore',
        content: `__pycache__/
*.py[cod]
.env
venv/
.vscode/
*.log
`
      }
    ]
  }
};
