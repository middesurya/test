import { Tool, ToolInput, ToolOutput } from '../types';

interface ExampleInput extends ToolInput {
  query: string;
  options?: {
    format?: 'json' | 'text';
  };
}

interface ExampleOutput extends ToolOutput {
  result: string;
  metadata: {
    processedAt: string;
    format: string;
  };
}

export const exampleTool: Tool<ExampleInput, ExampleOutput> = {
  name: 'example-tool',
  description: 'An example tool that processes queries',

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to process'
      },
      options: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'text'],
            default: 'json'
          }
        }
      }
    },
    required: ['query'],
    additionalProperties: false
  },

  async execute(input: ExampleInput): Promise<ExampleOutput> {
    const format = input.options?.format || 'json';

    return {
      result: `Processed: ${input.query}`,
      metadata: {
        processedAt: new Date().toISOString(),
        format
      }
    };
  }
};
