---
name: testing
description: Run and analyze MCP-specific tests including unit, integration, contract, and load tests. Use this for test execution and coverage analysis.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# MCP Testing Skill

## Purpose

Execute comprehensive test suites for MCP servers covering unit, integration, contract, and performance testing with analysis and improvement recommendations.

## Test Categories

### 1. Unit Tests

Test individual functions in isolation.

**Characteristics:**
- Fast (<10ms each)
- No external dependencies
- Mocked inputs/outputs
- High coverage target (>80%)

**Run Command:**
```bash
npm run test:unit
# or
npm test -- --testPathPattern="unit"
```

### 2. Integration Tests

Test component interactions.

**Characteristics:**
- Tool + Server integration
- Database interactions (test DB)
- External API calls (mocked)
- Medium speed (<1s each)

**Run Command:**
```bash
npm run test:integration
# or
npm test -- --testPathPattern="integration"
```

### 3. Contract Tests

Verify MCP spec compliance.

**Checks:**
- Tool schema follows JSON Schema draft-07
- Response format matches MCP spec
- Error codes are valid
- Capabilities advertised correctly

**Run Command:**
```bash
npm run test:contract
```

### 4. Load Tests

Verify performance targets.

**Targets (per MCP best practices):**
| Metric | Target |
|--------|--------|
| Throughput | >1000 req/s |
| Latency P95 | <100ms |
| Latency P99 | <500ms |
| Error Rate | <0.1% |

**Run Command:**
```bash
npm run test:load
# or
npx artillery run load-test.yml
```

## Test Execution Commands

### Run All Tests
```bash
npm test
```

### Run with Coverage
```bash
npm run test:coverage
# or
npm test -- --coverage
```

### Run Specific Test File
```bash
npm test -- path/to/test.ts
```

### Run in Watch Mode
```bash
npm test -- --watch
```

### Run with Verbose Output
```bash
npm test -- --verbose
```

## Mock Patterns

### LLM Response Mocking

```typescript
// tests/mocks/llm-mock.ts
export function mockLLMResponse(toolName: string, response: any) {
  jest.spyOn(llmClient, 'invoke').mockResolvedValue(response);
}

// Usage in test
import { mockLLMResponse } from '../mocks/llm-mock';

beforeEach(() => {
  mockLLMResponse('my-tool', {
    result: 'mocked response'
  });
});
```

### External API Mocking

```typescript
import nock from 'nock';

beforeEach(() => {
  nock('https://api.example.com')
    .get('/endpoint')
    .reply(200, { data: 'mocked' });
});

afterEach(() => {
  nock.cleanAll();
});
```

### Database Mocking

```typescript
import { mockDb } from '../mocks/db-mock';

beforeEach(() => {
  mockDb.query.mockResolvedValue([{ id: 1, name: 'Test' }]);
});
```

## Coverage Analysis

### Coverage Report Structure

```
----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
All files             |   85.5  |    78.2  |   90.1  |   85.5  |
 src/tools            |   92.3  |    85.0  |   95.0  |   92.3  |
  example-tool.ts     |   95.0  |    90.0  |  100.0  |   95.0  |
 src/utils            |   80.0  |    70.0  |   85.0  |   80.0  |
----------------------|---------|----------|---------|---------|
```

### Coverage Targets

| Category | Minimum | Target |
|----------|---------|--------|
| Statements | 70% | 85% |
| Branches | 60% | 75% |
| Functions | 80% | 90% |
| Lines | 70% | 85% |

## Test Result Analysis

### Interpreting Results

```markdown
## Test Results Analysis

### Summary
- Total: 45 tests
- Passed: 43
- Failed: 2
- Skipped: 0
- Duration: 12.5s

### Failed Tests

#### 1. fetch-user.test.ts > should handle API timeout
**Error**: Expected timeout error, received success
**Root Cause**: Mock not properly configured
**Fix**: Update mock to simulate timeout

#### 2. auth.test.ts > should reject expired token
**Error**: Token validation passed for expired token
**Root Cause**: Bug in token expiration check
**Fix**: Update isExpired() logic in auth/token-validator.ts

### Flaky Tests (inconsistent results)
- None detected

### Slow Tests (>100ms)
- integration/database.test.ts (250ms) - Consider mocking
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Timeout failures | Slow external calls | Mock or increase timeout |
| Schema mismatches | Spec out of sync | Update mcp-spec.json |
| State pollution | Missing cleanup | Add afterEach() cleanup |
| Flaky tests | Race conditions | Add proper async handling |

## Test Improvement Recommendations

### Missing Test Categories

```markdown
## Gap Analysis

### Untested Tools
- [ ] new-tool.ts - No tests found
- [ ] helper-tool.ts - Only unit tests, missing integration

### Untested Paths
- [ ] Error handling in fetch-user.ts line 45
- [ ] Edge case: empty array input in process-list.ts

### Missing Test Types
- [ ] Load tests not configured
- [ ] Contract tests not implemented
```

### Test Quality Improvements

```typescript
// Add missing assertions
it('should validate all output fields', async () => {
  const result = await tool.execute(input);

  // Currently only checks result exists
  expect(result).toBeDefined();

  // Should also check:
  expect(result.metadata).toBeDefined();
  expect(result.metadata.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  expect(result.metadata.inputLength).toBeGreaterThan(0);
});
```

## Reference Files

- `test/tests/` - Test directory structure
- `test/tests/mocks/` - Mock utilities
- `jest.config.js` or `vitest.config.ts` - Test configuration
