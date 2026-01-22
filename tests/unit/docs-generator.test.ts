/**
 * Tests for Documentation Generator
 */

import { generateToolDocumentation } from '../../src/utils/docs-generator';

describe('Docs Generator', () => {
  describe('generateToolDocumentation', () => {
    const sampleTool = {
      name: 'example-tool',
      description: 'An example tool for testing',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return'
          }
        },
        required: ['query']
      }
    };

    it('should generate markdown documentation', () => {
      const doc = generateToolDocumentation(sampleTool);

      expect(doc).toContain('### example-tool');
      expect(doc).toContain('An example tool for testing');
    });

    it('should include input parameters table', () => {
      const doc = generateToolDocumentation(sampleTool);

      expect(doc).toContain('| Parameter | Type | Required | Description |');
      expect(doc).toContain('| `query` | string | Yes |');
      expect(doc).toContain('| `limit` | number | No |');
    });

    it('should mark required parameters correctly', () => {
      const doc = generateToolDocumentation(sampleTool);

      expect(doc).toContain('| `query` | string | Yes |');
      expect(doc).toContain('| `limit` | number | No |');
    });

    it('should include example JSON', () => {
      const doc = generateToolDocumentation(sampleTool);

      expect(doc).toContain('**Example:**');
      expect(doc).toContain('```json');
      expect(doc).toContain('"query":');
    });

    it('should handle tools with no required params', () => {
      const optionalTool = {
        name: 'optional-tool',
        description: 'Tool with optional params only',
        inputSchema: {
          type: 'object',
          properties: {
            option: {
              type: 'string',
              description: 'Optional parameter'
            }
          }
        }
      };

      const doc = generateToolDocumentation(optionalTool);

      expect(doc).toContain('### optional-tool');
      expect(doc).toContain('| `option` | string | No |');
    });

    it('should handle tools with no properties', () => {
      const emptyTool = {
        name: 'empty-tool',
        description: 'Tool with no input',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      const doc = generateToolDocumentation(emptyTool);

      expect(doc).toContain('### empty-tool');
      expect(doc).toContain('| _none_ | - | - | No parameters required |');
    });

    it('should include property descriptions', () => {
      const doc = generateToolDocumentation(sampleTool);

      expect(doc).toContain('The search query');
      expect(doc).toContain('Maximum results to return');
    });

    it('should handle enum types', () => {
      const enumTool = {
        name: 'enum-tool',
        description: 'Tool with enum type',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description: 'Output format',
              enum: ['json', 'xml', 'csv']
            }
          },
          required: ['format']
        }
      };

      const doc = generateToolDocumentation(enumTool);

      expect(doc).toContain('`json`');
      expect(doc).toContain('`xml`');
      expect(doc).toContain('`csv`');
    });
  });
});
