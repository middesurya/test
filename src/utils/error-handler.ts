/**
 * MCP Error Handler Utilities
 * Per MCP best practices, errors are classified into three categories
 */

export enum ErrorCategory {
  CLIENT = 'client',     // Invalid input, auth failure - Don't retry
  SERVER = 'server',     // Internal error, bug - Don't retry
  EXTERNAL = 'external'  // API down, timeout - Retry allowed
}

interface ErrorOptions {
  code?: number;
  retry?: boolean;
  details?: Record<string, unknown>;
}

export class MCPError extends Error {
  readonly category: ErrorCategory;
  readonly code: number;
  readonly retry: boolean;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory,
    options: ErrorOptions = {}
  ) {
    super(message);
    this.name = 'MCPError';
    this.category = category;
    this.code = options.code || this.getDefaultCode(category);
    this.retry = options.retry ?? category === ErrorCategory.EXTERNAL;
    this.details = options.details;
  }

  private getDefaultCode(category: ErrorCategory): number {
    switch (category) {
      case ErrorCategory.CLIENT:
        return -32602; // Invalid params
      case ErrorCategory.SERVER:
        return -32603; // Internal error
      case ErrorCategory.EXTERNAL:
        return -32001; // External service error
      default:
        return -32000;
    }
  }

  toJSON(): object {
    return {
      error: {
        code: this.code,
        message: this.message,
        data: {
          category: this.category,
          retry: this.retry,
          ...this.details
        }
      }
    };
  }
}

/**
 * Client errors - Invalid input, authentication failures
 * These should NOT be retried
 */
export class ClientError extends MCPError {
  constructor(message: string, options: Omit<ErrorOptions, 'retry'> = {}) {
    super(message, ErrorCategory.CLIENT, { ...options, retry: false });
    this.name = 'ClientError';
  }
}

/**
 * Server errors - Internal bugs, configuration issues
 * These should NOT be retried
 */
export class ServerError extends MCPError {
  constructor(message: string, options: Omit<ErrorOptions, 'retry'> = {}) {
    super(message, ErrorCategory.SERVER, { ...options, retry: false });
    this.name = 'ServerError';
  }
}

/**
 * External errors - Third-party API failures, timeouts
 * These CAN be retried
 */
export class ExternalError extends MCPError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, ErrorCategory.EXTERNAL, { retry: true, ...options });
    this.name = 'ExternalError';
  }
}

/**
 * Validation error with field-specific details
 */
export class ValidationError extends ClientError {
  readonly field: string;
  readonly constraint: string;

  constructor(field: string, constraint: string, value?: unknown) {
    super(`Validation failed: ${field} ${constraint}`);
    this.name = 'ValidationError';
    this.field = field;
    this.constraint = constraint;
    if (value !== undefined) {
      this.details = { ...this.details, invalidValue: value };
    }
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends ClientError {
  readonly retryAfter: number;

  constructor(retryAfterMs: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterMs;
    this.details = { retryAfterMs };
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends ClientError {
  constructor(message: string = 'Authentication required') {
    super(message, { code: -32001 });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends ClientError {
  readonly requiredScopes: string[];

  constructor(requiredScopes: string[]) {
    super('Insufficient permissions');
    this.name = 'AuthorizationError';
    this.requiredScopes = requiredScopes;
    this.details = { requiredScopes };
  }
}

/**
 * Timeout error for external services
 */
export class TimeoutError extends ExternalError {
  constructor(service: string, timeoutMs: number) {
    super(`Request to ${service} timed out after ${timeoutMs}ms`, {
      details: { service, timeoutMs }
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Helper to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MCPError) {
    return error.retry;
  }
  // Network errors are typically retryable
  if (error instanceof Error) {
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].some(code =>
      error.message.includes(code)
    );
  }
  return false;
}

/**
 * Helper to classify unknown errors
 */
export function classifyError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common network/external errors
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('fetch failed')
    ) {
      return new ExternalError('External service unavailable', {
        details: { originalMessage: error.message }
      });
    }

    // Default to server error for unknown errors
    return new ServerError('Internal error', {
      details: { originalMessage: error.message }
    });
  }

  return new ServerError('Unknown error occurred');
}

/**
 * Error handler wrapper for tool execution
 */
export function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  return fn().catch((error) => {
    const mcpError = classifyError(error);
    if (context) {
      mcpError.details = { ...mcpError.details, context };
    }
    throw mcpError;
  });
}
