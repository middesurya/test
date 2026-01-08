---
name: tool-gen
description: Add new tools to existing MCP server projects with proper schemas, tests, and registry integration. Use this when adding new tool functionality.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# MCP Tool Generation Skill

## Purpose

Generate MCP tools with comprehensive input schemas, proper error handling, and full test coverage following project conventions.

## Tool Creation Workflow

### Step 1: Gather Tool Requirements

Required information:
- **Tool name** (kebab-case)
- **Description** (clear, for LLM understanding)
- **Input parameters** (types, required/optional)
- **Output format** (return type)
- **Error cases** (what can fail)

### Step 2: Generate Input Schema

Follow JSON Schema draft-07:

```typescript
const inputSchema = {
  type: 'object',
  properties: {
    // Required fields first, with clear descriptions
    primaryInput: {
      type: 'string',
      description: 'Clear description for LLM consumption',
      minLength: 1,
      maxLength: 10000
    },
    // Optional fields with sensible defaults
    options: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 10,
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of results'
        },
        format: {
          type: 'string',
          enum: ['json', 'text'],
          default: 'json',
          description: 'Output format'
        }
      }
    }
  },
  required: ['primaryInput'],
  additionalProperties: false  // Security: reject unknown fields
};
```

### Step 3: Generate Tool Implementation

```typescript
// src/tools/{tool-name}.ts
import { Tool, ToolInput, ToolOutput } from '../types';
import { logger } from '../utils/logger';
import {
  ClientError,
  ServerError,
  ExternalError
} from '../utils/error-handler';

interface {ToolName}Input extends ToolInput {
  primaryInput: string;
  options?: {
    limit?: number;
    format?: 'json' | 'text';
  };
}

interface {ToolName}Output extends ToolOutput {
  result: string;
  metadata: {
    processedAt: string;
    inputLength: number;
  };
}

export const {toolName}Tool: Tool<{ToolName}Input, {ToolName}Output> = {
  name: '{tool-name}',
  description: '{Tool description for LLM}',

  inputSchema: { /* ... */ },

  async execute(input: {ToolName}Input): Promise<{ToolName}Output> {
    const startTime = Date.now();
    logger.info({ tool: '{tool-name}', input }, 'Tool execution started');

    try {
      // 1. Validate input (beyond schema)
      if (!input.primaryInput.trim()) {
        throw new ClientError('Input cannot be empty');
      }

      // 2. Execute core logic
      const result = await processInput(input);

      // 3. Return structured output
      const output = {
        result,
        metadata: {
          processedAt: new Date().toISOString(),
          inputLength: input.primaryInput.length,
          durationMs: Date.now() - startTime
        }
      };

      logger.info({ tool: '{tool-name}', durationMs: output.metadata.durationMs }, 'Tool execution completed');
      return output;

    } catch (error) {
      // 4. Classify and handle errors
      if (error instanceof ClientError) {
        throw error; // Re-throw client errors as-is
      }
      if (isExternalServiceError(error)) {
        throw new ExternalError('External service unavailable', { retry: true });
      }
      throw new ServerError('Internal processing error');
    }
  }
};
```

### Step 4: Generate Tests

```typescript
// tests/tools/{tool-name}.test.ts
import { {toolName}Tool } from '../../src/tools/{tool-name}';

describe('{ToolName} Tool', () => {
  describe('input validation', () => {
    it('should accept valid input', async () => {
      const input = { primaryInput: 'test query' };
      const result = await {toolName}Tool.execute(input);
      expect(result).toBeDefined();
      expect(result.result).toBeDefined();
    });

    it('should reject empty input', async () => {
      const input = { primaryInput: '' };
      await expect({toolName}Tool.execute(input))
        .rejects.toThrow('Input cannot be empty');
    });

    it('should apply default options', async () => {
      const input = { primaryInput: 'test' };
      const result = await {toolName}Tool.execute(input);
      expect(result.metadata).toBeDefined();
    });
  });

  describe('execution', () => {
    it('should return expected output structure', async () => {
      const input = { primaryInput: 'test query' };
      const result = await {toolName}Tool.execute(input);

      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('metadata.processedAt');
      expect(result).toHaveProperty('metadata.inputLength');
    });

    it('should handle errors gracefully', async () => {
      // Mock external failure
      const input = { primaryInput: 'trigger-error' };
      await expect({toolName}Tool.execute(input))
        .rejects.toThrow();
    });
  });

  describe('performance', () => {
    it('should complete within 100ms for simple input', async () => {
      const input = { primaryInput: 'simple test' };
      const start = Date.now();
      await {toolName}Tool.execute(input);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
```

### Step 5: Update Tool Registry

```typescript
// src/tools/index.ts
export { {toolName}Tool } from './{tool-name}';

// Add to registry
import { {toolName}Tool } from './{tool-name}';

export const toolRegistry = {
  // ... existing tools
  '{tool-name}': {toolName}Tool,
};
```

### Step 6: Update mcp-spec.json

```json
{
  "tools": [
    // ... existing tools
    {
      "name": "{tool-name}",
      "description": "{Tool description}",
      "inputSchema": { /* ... */ }
    }
  ]
}
```

## Error Handling Categories

Per MCP best practices, classify errors:

| Category | Examples | Retry? |
|----------|----------|--------|
| **Client** | Invalid input, auth failure | No |
| **Server** | Internal error, bug | No |
| **External** | API down, timeout | Yes |

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| File name | kebab-case | `fetch-user.ts` |
| Tool name | kebab-case | `fetch-user` |
| Export name | camelCase + Tool | `fetchUserTool` |
| Interface | PascalCase + Input/Output | `FetchUserInput` |

## Usage Examples

### Simple Tool
```
Add a tool named "fetch-user" that retrieves user data by ID
- Input: userId (string, required)
- Output: user object with name, email
- Errors: User not found, API unavailable
```

### Complex Tool
```
Create a tool "analyze-document" with:
- Input: documentUrl (string, required), options (format: pdf|docx, extractImages: boolean)
- Output: analysis result with text, metadata, optional images
- Rate limit: 10 requests per minute
```

## Reference Files

- `test/src/commands/add.ts` - Add command implementation
- `test/src/utils/tool-generator.ts` - Tool generation utilities
- `test/src/utils/validation.ts` - Naming validation
