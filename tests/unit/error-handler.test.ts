/**
 * Unit Tests for Error Handler Utilities
 */

import {
  MCPError,
  ClientError,
  ServerError,
  ExternalError,
  ValidationError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  TimeoutError,
  ErrorCategory,
  isRetryableError,
  classifyError,
  withErrorHandling
} from '../../src/utils/error-handler';

describe('MCPError', () => {
  it('should create error with correct properties', () => {
    const error = new MCPError('Test error', ErrorCategory.CLIENT);

    expect(error.message).toBe('Test error');
    expect(error.category).toBe(ErrorCategory.CLIENT);
    expect(error.name).toBe('MCPError');
  });

  it('should use default error codes', () => {
    const clientError = new MCPError('Client', ErrorCategory.CLIENT);
    const serverError = new MCPError('Server', ErrorCategory.SERVER);
    const externalError = new MCPError('External', ErrorCategory.EXTERNAL);

    expect(clientError.code).toBe(-32602);
    expect(serverError.code).toBe(-32603);
    expect(externalError.code).toBe(-32001);
  });

  it('should allow custom error codes', () => {
    const error = new MCPError('Test', ErrorCategory.CLIENT, { code: -32700 });
    expect(error.code).toBe(-32700);
  });

  it('should set retry based on category', () => {
    const clientError = new MCPError('Client', ErrorCategory.CLIENT);
    const externalError = new MCPError('External', ErrorCategory.EXTERNAL);

    expect(clientError.retry).toBe(false);
    expect(externalError.retry).toBe(true);
  });

  it('should serialize to JSON correctly', () => {
    const error = new MCPError('Test', ErrorCategory.SERVER, {
      details: { context: 'unit test' }
    });

    const json = error.toJSON();
    expect(json).toHaveProperty('error');
    expect((json as any).error.code).toBe(-32603);
    expect((json as any).error.message).toBe('Test');
    expect((json as any).error.data.category).toBe('server');
  });
});

describe('ClientError', () => {
  it('should create client error', () => {
    const error = new ClientError('Invalid input');

    expect(error.category).toBe(ErrorCategory.CLIENT);
    expect(error.retry).toBe(false);
    expect(error.name).toBe('ClientError');
  });

  it('should never be retryable', () => {
    const error = new ClientError('Test');
    expect(error.retry).toBe(false);
  });
});

describe('ServerError', () => {
  it('should create server error', () => {
    const error = new ServerError('Internal error');

    expect(error.category).toBe(ErrorCategory.SERVER);
    expect(error.retry).toBe(false);
    expect(error.name).toBe('ServerError');
  });
});

describe('ExternalError', () => {
  it('should create external error', () => {
    const error = new ExternalError('Service unavailable');

    expect(error.category).toBe(ErrorCategory.EXTERNAL);
    expect(error.retry).toBe(true);
    expect(error.name).toBe('ExternalError');
  });

  it('should allow disabling retry', () => {
    const error = new ExternalError('Permanent failure', { retry: false });
    expect(error.retry).toBe(false);
  });
});

describe('ValidationError', () => {
  it('should create validation error with field info', () => {
    const error = new ValidationError('email', 'must be valid email', 'invalid');

    expect(error.field).toBe('email');
    expect(error.constraint).toBe('must be valid email');
    expect(error.message).toContain('email');
    expect(error.message).toContain('must be valid email');
  });

  it('should include invalid value in details', () => {
    const error = new ValidationError('count', 'must be positive', -5);
    expect(error.details?.invalidValue).toBe(-5);
  });
});

describe('RateLimitError', () => {
  it('should include retry after time', () => {
    const error = new RateLimitError(30000);

    expect(error.retryAfter).toBe(30000);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.details?.retryAfterMs).toBe(30000);
  });
});

describe('AuthenticationError', () => {
  it('should create with default message', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Authentication required');
  });

  it('should accept custom message', () => {
    const error = new AuthenticationError('Token expired');
    expect(error.message).toBe('Token expired');
  });
});

describe('AuthorizationError', () => {
  it('should include required scopes', () => {
    const error = new AuthorizationError(['read:users', 'write:users']);

    expect(error.requiredScopes).toEqual(['read:users', 'write:users']);
    expect(error.details?.requiredScopes).toEqual(['read:users', 'write:users']);
  });
});

describe('TimeoutError', () => {
  it('should include service and timeout info', () => {
    const error = new TimeoutError('api.example.com', 5000);

    expect(error.message).toContain('api.example.com');
    expect(error.message).toContain('5000ms');
    expect(error.retry).toBe(true);
  });
});

describe('isRetryableError', () => {
  it('should return true for external errors', () => {
    const error = new ExternalError('Service down');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for client errors', () => {
    const error = new ClientError('Invalid');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return false for server errors', () => {
    const error = new ServerError('Bug');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should detect network errors', () => {
    const error = new Error('ECONNRESET');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should detect timeout errors', () => {
    const error = new Error('ETIMEDOUT');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for unknown errors', () => {
    const error = new Error('Unknown');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isRetryableError('string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('classifyError', () => {
  it('should return MCPError as-is', () => {
    const original = new ClientError('Test');
    const classified = classifyError(original);
    expect(classified).toBe(original);
  });

  it('should classify network errors as external', () => {
    const error = new Error('ECONNREFUSED');
    const classified = classifyError(error);

    expect(classified).toBeInstanceOf(ExternalError);
    expect(classified.category).toBe(ErrorCategory.EXTERNAL);
  });

  it('should classify fetch errors as external', () => {
    const error = new Error('fetch failed');
    const classified = classifyError(error);

    expect(classified).toBeInstanceOf(ExternalError);
  });

  it('should classify unknown errors as server errors', () => {
    const error = new Error('Something broke');
    const classified = classifyError(error);

    expect(classified).toBeInstanceOf(ServerError);
    expect(classified.category).toBe(ErrorCategory.SERVER);
  });

  it('should handle non-Error values', () => {
    const classified = classifyError('string error');
    expect(classified).toBeInstanceOf(ServerError);
    expect(classified.message).toBe('Unknown error occurred');
  });
});

describe('withErrorHandling', () => {
  it('should pass through successful results', async () => {
    const result = await withErrorHandling(async () => 'success');
    expect(result).toBe('success');
  });

  it('should classify and rethrow errors', async () => {
    await expect(
      withErrorHandling(async () => {
        throw new Error('ECONNREFUSED');
      })
    ).rejects.toBeInstanceOf(ExternalError);
  });

  it('should add context to errors', async () => {
    try {
      await withErrorHandling(async () => {
        throw new Error('Test');
      }, 'fetch-user');
      fail('Should have thrown');
    } catch (error) {
      expect((error as MCPError).details?.context).toBe('fetch-user');
    }
  });

  it('should preserve MCP errors', async () => {
    const original = new ClientError('Invalid');

    await expect(
      withErrorHandling(async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });
});
