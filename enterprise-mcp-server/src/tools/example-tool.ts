import type { JSONSchema7 } from 'json-schema';
import { Tool, ToolInput, ToolOutput } from '../types';

interface Input extends ToolInput { query: string; }
interface Output extends ToolOutput { result: string; processedAt: string; }

const inputSchema: JSONSchema7 = {
  type: 'object',
  properties: { query: { type: 'string', maxLength: 1000 } },
  required: ['query'],
  additionalProperties: false
};

export const exampleTool: Tool<Input, Output> = {
  name: 'example-tool',
  description: 'A secure example tool',
  requiredScopes: ['tools:execute'],
  inputSchema,
  async execute(input: Input): Promise<Output> {
    return { result: `Processed: ${input.query}`, processedAt: new Date().toISOString() };
  }
};
