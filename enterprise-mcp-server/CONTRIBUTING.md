# Contributing to enterprise-mcp-server

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/enterprise-mcp-server.git
   cd enterprise-mcp-server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Adding New Tools

1. Create tool file: `src/tools/your-tool.ts`

```typescript
import { Tool, ToolInput, ToolOutput } from '../types';

interface YourInput extends ToolInput {
  param: string;
}

interface YourOutput extends ToolOutput {
  result: string;
}

export const yourTool: Tool<YourInput, YourOutput> = {
  name: 'your-tool',
  description: 'Description of what your tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param: {
        type: 'string',
        description: 'Parameter description'
      }
    },
    required: ['param'],
    additionalProperties: false
  },
  async execute(input: YourInput): Promise<YourOutput> {
    // Implement your logic
    return { result: `Processed: ${input.param}` };
  }
};
```

2. Add tests: `tests/tools/your-tool.test.ts`
3. Register in `src/index.ts`
4. Update `mcp-spec.json`

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Conventional Commits for messages

```bash
# Check style
npm run lint

# Fix issues
npm run lint:fix
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage (target: 80%+)
npm run test:coverage

# Run specific test
npm test -- --testPathPattern="your-tool"
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add entry to CHANGELOG.md
4. Submit PR with clear description
5. Address review feedback

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(tools): add new data-fetch tool
fix(auth): handle expired tokens correctly
docs(readme): update installation instructions
```

## Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all inputs
- Follow OWASP guidelines

## Questions?

Open an issue or reach out to maintainers.
