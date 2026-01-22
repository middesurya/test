/**
 * Test Mock Utilities
 * Centralized mocking for MCP server testing
 */

import { EventEmitter } from 'events';

// ============================================
// LLM/AI Response Mocking
// ============================================

export interface MockLLMResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export function createMockLLM(responses: MockLLMResponse[] = []) {
  let callIndex = 0;

  return {
    invoke: jest.fn().mockImplementation(async () => {
      const response = responses[callIndex] || { content: 'Mock response' };
      callIndex++;
      return response;
    }),
    reset: () => { callIndex = 0; },
    getCallCount: () => callIndex
  };
}

// ============================================
// HTTP/API Mocking
// ============================================

export interface MockHttpResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

export function createMockHttpClient() {
  const responses = new Map<string, MockHttpResponse>();

  return {
    get: jest.fn().mockImplementation(async (url: string) => {
      const response = responses.get(`GET:${url}`) || { status: 200, data: {} };
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    }),
    post: jest.fn().mockImplementation(async (url: string, body?: unknown) => {
      const response = responses.get(`POST:${url}`) || { status: 200, data: {} };
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    }),
    setResponse: (method: string, url: string, response: MockHttpResponse) => {
      responses.set(`${method}:${url}`, response);
    },
    reset: () => responses.clear()
  };
}

// ============================================
// Database Mocking
// ============================================

export function createMockDatabase() {
  const store = new Map<string, unknown>();

  return {
    query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      // Simple mock - return empty array by default
      return [];
    }),
    get: jest.fn().mockImplementation(async (key: string) => {
      return store.get(key);
    }),
    set: jest.fn().mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: jest.fn().mockImplementation(async (key: string) => {
      return store.delete(key);
    }),
    setData: (key: string, value: unknown) => store.set(key, value),
    reset: () => store.clear()
  };
}

// ============================================
// MCP Server Mocking
// ============================================

export function createMockMCPServer() {
  const tools = new Map<string, any>();
  const events = new EventEmitter();

  return {
    registerTool: jest.fn().mockImplementation((tool) => {
      tools.set(tool.name, tool);
    }),
    handleToolCall: jest.fn().mockImplementation(async (name: string, input: unknown) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.execute(input);
    }),
    listTools: jest.fn().mockImplementation(() => {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }));
    }),
    on: (event: string, handler: (...args: any[]) => void) => events.on(event, handler),
    emit: (event: string, ...args: any[]) => events.emit(event, ...args),
    tools,
    reset: () => tools.clear()
  };
}

// ============================================
// Request/Response Mocking
// ============================================

export function createMockRequest(overrides: Partial<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}> = {}) {
  return {
    method: overrides.method || 'POST',
    url: overrides.url || '/mcp',
    headers: {
      'content-type': 'application/json',
      ...overrides.headers
    },
    body: overrides.body || {},
    socket: { remoteAddress: '127.0.0.1' },
    on: jest.fn()
  };
}

export function createMockResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body = '';

  return {
    writeHead: jest.fn().mockImplementation((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) {
        Object.entries(hdrs).forEach(([k, v]) => headers.set(k, v));
      }
    }),
    setHeader: jest.fn().mockImplementation((name: string, value: string) => {
      headers.set(name, value);
    }),
    end: jest.fn().mockImplementation((data?: string) => {
      body = data || '';
    }),
    getStatusCode: () => statusCode,
    getHeaders: () => Object.fromEntries(headers),
    getBody: () => body,
    getJSON: () => JSON.parse(body || '{}')
  };
}

// ============================================
// Timer Mocking
// ============================================

export function mockTimers() {
  jest.useFakeTimers();

  return {
    advance: (ms: number) => jest.advanceTimersByTime(ms),
    runAll: () => jest.runAllTimers(),
    restore: () => jest.useRealTimers()
  };
}

// ============================================
// Environment Mocking
// ============================================

export function mockEnv(vars: Record<string, string>) {
  const original = { ...process.env };

  Object.assign(process.env, vars);

  return {
    restore: () => {
      Object.keys(vars).forEach(key => {
        if (original[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original[key];
        }
      });
    }
  };
}

// ============================================
// Error Simulation
// ============================================

export function createErrorSimulator() {
  let shouldFail = false;
  let errorType: 'network' | 'timeout' | 'auth' | 'rate-limit' | 'server' = 'server';

  const errors = {
    network: new Error('ECONNREFUSED'),
    timeout: new Error('ETIMEDOUT'),
    auth: new Error('Authentication required'),
    'rate-limit': new Error('Rate limit exceeded'),
    server: new Error('Internal server error')
  };

  return {
    enableFailure: (type: typeof errorType = 'server') => {
      shouldFail = true;
      errorType = type;
    },
    disableFailure: () => {
      shouldFail = false;
    },
    maybeThrow: () => {
      if (shouldFail) {
        throw errors[errorType];
      }
    },
    getError: () => shouldFail ? errors[errorType] : null
  };
}
