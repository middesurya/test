/**
 * LLM Mock Utilities for Deterministic Testing
 *
 * This module solves the "vibe-testing" problem where AI responses
 * are non-deterministic, making tests flaky and debugging painful.
 *
 * Instead of calling real LLMs in tests, use these mocks to:
 * - Get predictable, repeatable responses
 * - Test edge cases and error conditions
 * - Run tests quickly without API costs
 * - Verify your tools are called correctly
 *
 * @example
 * ```typescript
 * import { llmMock, createMockAgent } from 'mcp-gen/llm-mock';
 *
 * beforeEach(() => llmMock.reset());
 *
 * it('should call the search tool', async () => {
 *   llmMock
 *     .when('find information about')
 *     .thenCallTool('search', { query: 'cats' });
 *
 *   const agent = createMockAgent(myMCPServer);
 *   await agent.process('find information about cats');
 *
 *   expect(llmMock.verifyCalled('find information')).toBe(true);
 * });
 * ```
 */

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockLLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface CallRecord {
  prompt: string;
  response: MockLLMResponse;
  timestamp: Date;
}

/**
 * Mock LLM for deterministic testing
 */
export class LLMMock {
  private responses: Map<string, MockLLMResponse[]> = new Map();
  private callHistory: CallRecord[] = [];
  private defaultResponse: MockLLMResponse = {
    content: '[Mock] No matching response configured',
    finishReason: 'stop'
  };

  /**
   * Configure a response for prompts matching a pattern
   *
   * @example
   * llmMock.when('search for').thenReturn({ content: 'Found results' });
   * llmMock.when(/translate.*to spanish/i).thenCallTool('translate', { lang: 'es' });
   */
  when(pattern: string | RegExp): MockResponseBuilder {
    return new MockResponseBuilder(this, pattern);
  }

  /**
   * Set the default response for unmatched prompts
   */
  setDefaultResponse(response: Partial<MockLLMResponse>): this {
    this.defaultResponse = {
      content: response.content || '',
      toolCalls: response.toolCalls,
      finishReason: response.finishReason || 'stop',
      usage: response.usage
    };
    return this;
  }

  /**
   * Add a response to the queue for a pattern
   * @internal
   */
  addResponse(pattern: string, response: MockLLMResponse): void {
    const key = pattern;
    const existing = this.responses.get(key) || [];
    existing.push(response);
    this.responses.set(key, existing);
  }

  /**
   * Simulate an LLM completion
   */
  async complete(prompt: string): Promise<MockLLMResponse> {
    // Check each pattern for a match
    for (const [pattern, responses] of this.responses.entries()) {
      let regex: RegExp;
      try {
        // Handle both string patterns and regex-like strings
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
          const lastSlash = pattern.lastIndexOf('/');
          const flags = pattern.slice(lastSlash + 1);
          const regexBody = pattern.slice(1, lastSlash);
          regex = new RegExp(regexBody, flags);
        } else {
          regex = new RegExp(pattern, 'i');
        }
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }

      if (regex.test(prompt)) {
        const response = responses.length > 0
          ? responses.shift()!
          : { ...this.defaultResponse };

        this.callHistory.push({
          prompt,
          response,
          timestamp: new Date()
        });

        // Simulate network delay
        await this.delay(10);

        return response;
      }
    }

    // No pattern matched, use default
    const response = { ...this.defaultResponse };
    this.callHistory.push({
      prompt,
      response,
      timestamp: new Date()
    });

    return response;
  }

  /**
   * Simulate a streaming completion
   */
  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const response = await this.complete(prompt);

    // Simulate streaming by yielding words
    const words = response.content.split(' ');
    for (const word of words) {
      await this.delay(5);
      yield word + ' ';
    }
  }

  /**
   * Get the complete call history
   */
  getCallHistory(): CallRecord[] {
    return [...this.callHistory];
  }

  /**
   * Get calls matching a pattern
   */
  getCalls(pattern: string | RegExp): CallRecord[] {
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern, 'i')
      : pattern;
    return this.callHistory.filter(call => regex.test(call.prompt));
  }

  /**
   * Verify that a call matching the pattern was made
   */
  verifyCalled(pattern: string | RegExp): boolean {
    return this.getCalls(pattern).length > 0;
  }

  /**
   * Verify a tool was called with specific arguments
   */
  verifyToolCalled(toolName: string, expectedArgs?: Record<string, unknown>): boolean {
    for (const call of this.callHistory) {
      const toolCalls = call.response.toolCalls || [];
      for (const toolCall of toolCalls) {
        if (toolCall.name === toolName) {
          if (!expectedArgs) return true;

          // Check if arguments match
          const argsMatch = Object.entries(expectedArgs).every(
            ([key, value]) => toolCall.arguments[key] === value
          );
          if (argsMatch) return true;
        }
      }
    }
    return false;
  }

  /**
   * Get the number of calls made
   */
  getCallCount(): number {
    return this.callHistory.length;
  }

  /**
   * Reset all mocks and history
   */
  reset(): void {
    this.responses.clear();
    this.callHistory = [];
    this.defaultResponse = {
      content: '[Mock] No matching response configured',
      finishReason: 'stop'
    };
  }

  /**
   * Create a snapshot of current state for debugging
   */
  snapshot(): {
    patterns: string[];
    callCount: number;
    lastCall?: CallRecord;
  } {
    return {
      patterns: Array.from(this.responses.keys()),
      callCount: this.callHistory.length,
      lastCall: this.callHistory[this.callHistory.length - 1]
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Builder for configuring mock responses
 */
class MockResponseBuilder {
  constructor(
    private mock: LLMMock,
    private pattern: string | RegExp
  ) {}

  /**
   * Return a text response
   */
  thenReturn(response: string | Partial<MockLLMResponse>): LLMMock {
    const fullResponse: MockLLMResponse = typeof response === 'string'
      ? { content: response, finishReason: 'stop' }
      : {
          content: response.content || '',
          toolCalls: response.toolCalls,
          finishReason: response.finishReason || 'stop',
          usage: response.usage
        };

    this.mock.addResponse(this.pattern.toString(), fullResponse);
    return this.mock;
  }

  /**
   * Return a tool call response
   */
  thenCallTool(toolName: string, args: Record<string, unknown>): LLMMock {
    return this.thenReturn({
      content: '',
      toolCalls: [{ name: toolName, arguments: args }],
      finishReason: 'tool_calls'
    });
  }

  /**
   * Return multiple tool calls
   */
  thenCallTools(tools: Array<{ name: string; args: Record<string, unknown> }>): LLMMock {
    return this.thenReturn({
      content: '',
      toolCalls: tools.map(t => ({ name: t.name, arguments: t.args })),
      finishReason: 'tool_calls'
    });
  }

  /**
   * Simulate an error response
   */
  thenError(message: string): LLMMock {
    return this.thenReturn({
      content: `Error: ${message}`,
      finishReason: 'error'
    });
  }

  /**
   * Simulate a length-limited response
   */
  thenTruncate(content: string): LLMMock {
    return this.thenReturn({
      content,
      finishReason: 'length'
    });
  }
}

/**
 * Create a mock agent that uses the LLM mock
 */
export function createMockAgent(mcpServer: {
  handleToolCall: (name: string, input: unknown) => Promise<unknown>;
}) {
  return {
    async process(prompt: string): Promise<{
      response: MockLLMResponse;
      toolResults: Array<{ name: string; result: unknown }>;
    }> {
      const response = await llmMock.complete(prompt);
      const toolResults: Array<{ name: string; result: unknown }> = [];

      // Execute any tool calls
      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          try {
            const result = await mcpServer.handleToolCall(
              toolCall.name,
              toolCall.arguments
            );
            toolResults.push({ name: toolCall.name, result });
          } catch (error) {
            toolResults.push({
              name: toolCall.name,
              result: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
          }
        }
      }

      return { response, toolResults };
    }
  };
}

// Singleton instance for easy access
export const llmMock = new LLMMock();

// Re-export for convenience
export default llmMock;
