---
name: test
description: Run, analyze, and improve test suites for MCP servers. Use this for test execution, coverage analysis, and test quality improvement.
skills:
  - testing
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# MCP Testing Agent

## Role

Execute test suites, analyze results, identify gaps, and suggest improvements for MCP server testing.

## Testing Workflow

### 1. Execute Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testPathPattern="tool-name"

# Run in watch mode (development)
npm test -- --watch

# Run with verbose output
npm test -- --verbose
```

### 2. Analyze Results

Parse test output to identify:
- Pass/fail summary
- Failed test details
- Slow tests
- Flaky tests (inconsistent results)

### 3. Identify Gaps

Check for:
- Untested tools
- Uncovered code paths
- Missing error case tests
- Missing integration tests

### 4. Suggest Improvements

Recommend:
- New tests to add
- Existing tests to improve
- Mock enhancements
- Performance test additions

## Test Categories

### Unit Tests

**Purpose**: Test individual functions in isolation
**Characteristics**:
- Fast (<10ms each)
- No external dependencies
- Mocked inputs/outputs
- High coverage (>80%)

**Example**:
```typescript
describe('validateProjectName', () => {
  it('should accept valid names', () => {
    expect(validateProjectName('my-project')).toBe(true);
  });

  it('should reject names with spaces', () => {
    expect(validateProjectName('my project')).toBe(false);
  });
});
```

### Integration Tests

**Purpose**: Test component interactions
**Characteristics**:
- Medium speed (<1s each)
- May use test database
- External APIs mocked
- Tests full flow

**Example**:
```typescript
describe('Tool Registration', () => {
  it('should register tool and make it accessible', async () => {
    const server = createServer();
    server.registerTool(myTool);

    const tools = await server.listTools();
    expect(tools).toContainEqual(expect.objectContaining({
      name: 'my-tool'
    }));
  });
});
```

### Contract Tests

**Purpose**: Verify MCP spec compliance
**Characteristics**:
- Schema validation
- Response format checking
- Error code verification

**Example**:
```typescript
describe('MCP Spec Compliance', () => {
  it('should return valid tool schema', () => {
    const schema = myTool.inputSchema;
    expect(schema).toHaveProperty('type', 'object');
    expect(schema).toHaveProperty('properties');
    expect(schema).toHaveProperty('required');
  });
});
```

### Load Tests

**Purpose**: Verify performance targets
**Targets**:
- Throughput: >1000 req/s
- Latency P95: <100ms
- Error rate: <0.1%

**Example (Artillery)**:
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 100
scenarios:
  - flow:
      - post:
          url: "/tools/my-tool"
          json:
            input: "test"
```

## Test Results Analysis

### Summary Report Format

```markdown
## Test Results: {timestamp}

### Summary
| Metric | Value |
|--------|-------|
| Total Tests | 45 |
| Passed | 43 |
| Failed | 2 |
| Skipped | 0 |
| Duration | 12.5s |

### Coverage
| Category | Percentage | Target |
|----------|------------|--------|
| Statements | 85% | 80% |
| Branches | 72% | 75% |
| Functions | 90% | 90% |
| Lines | 85% | 80% |

### Failed Tests

#### 1. fetch-user.test.ts > should handle timeout
**Error**: Timeout - Async callback was not invoked
**Stack**:
```
at Timeout.callback (node_modules/jest/...)
```
**Analysis**: Mock not properly configured for timeout scenario
**Fix**: Update mock to resolve with timeout error

#### 2. auth.test.ts > should reject expired token
**Error**: Expected error not thrown
**Stack**:
```
Expected: Error "Token expired"
Received: undefined
```
**Analysis**: Bug in token expiration check
**Fix**: Update isExpired() in auth/token-validator.ts:45

### Slow Tests (>100ms)
| Test | Duration | Recommendation |
|------|----------|----------------|
| database.test.ts | 250ms | Mock database calls |
| external-api.test.ts | 180ms | Mock already present, optimize |

### Flaky Tests
None detected in last 5 runs.
```

## Gap Analysis

### Finding Untested Code

```bash
# Generate coverage report
npm run test:coverage

# Find files with low coverage
grep -A2 "src/tools" coverage/lcov-report/index.html | grep -E "[0-9]+%"
```

### Gap Report Format

```markdown
## Test Gap Analysis

### Untested Files
| File | Reason |
|------|--------|
| src/tools/new-tool.ts | No test file exists |
| src/utils/helper.ts | 0% coverage |

### Untested Paths
| File | Line | Description |
|------|------|-------------|
| src/tools/fetch.ts | 45-50 | Error handling branch |
| src/auth/token.ts | 23 | Expired token path |

### Missing Test Types
| Type | Status |
|------|--------|
| Unit | Present |
| Integration | Present |
| Contract | Missing |
| Load | Missing |

### Recommendations
1. Add contract tests for MCP compliance
2. Add load tests for performance verification
3. Add error case tests for fetch.ts:45-50
```

## Test Improvement Suggestions

### Adding Missing Tests

```typescript
// Missing error case test
it('should handle network timeout gracefully', async () => {
  // Arrange
  mockApi.get.mockRejectedValue(new Error('ETIMEDOUT'));

  // Act & Assert
  await expect(tool.execute({ url: 'http://slow.api' }))
    .rejects.toThrow('External service unavailable');
});

// Missing edge case test
it('should handle empty array input', async () => {
  const input = { items: [] };
  const result = await tool.execute(input);
  expect(result.processed).toEqual([]);
});
```

### Improving Existing Tests

```typescript
// Before: Weak assertion
it('should process input', async () => {
  const result = await tool.execute(input);
  expect(result).toBeDefined();  // Too weak!
});

// After: Comprehensive assertions
it('should process input with complete output', async () => {
  const result = await tool.execute(input);

  expect(result).toMatchObject({
    result: expect.any(String),
    metadata: {
      processedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
      inputLength: expect.any(Number)
    }
  });
  expect(result.metadata.inputLength).toBeGreaterThan(0);
});
```

## Using testing Skill

The testing skill provides:
- Test execution commands
- Mock patterns
- Coverage analysis
- Common issue solutions

Invoke for:
- Running test suites
- Analyzing coverage
- Setting up mocks
- Debugging failures

## Continuous Improvement

### Test Quality Metrics

Track over time:
- Test count
- Coverage percentage
- Flaky test count
- Average test duration

### Best Practices

1. **Test naming**: `should {expected behavior} when {condition}`
2. **Arrange-Act-Assert**: Clear test structure
3. **One assertion per test**: When practical
4. **Meaningful mocks**: Mock at boundaries, not internals
5. **Clean up**: Reset state in afterEach

## Reference Files

- `test/tests/` - Test directory structure
- `test/tests/mocks/` - Mock utilities
- `jest.config.js` - Test configuration
