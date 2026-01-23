/**
 * Security Checker Utility
 * Automated security checks for MCP server code review
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  file: string;
  line?: number;
  message: string;
  suggestion: string;
  reference?: string;
}

export interface SecurityReport {
  timestamp: string;
  projectPath: string;
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  passed: boolean;
}

// Patterns to detect potential security issues
const SECURITY_PATTERNS = {
  // ===========================================
  // OWASP MCP-Specific Security Patterns
  // ===========================================

  // Tool Poisoning: Hidden instructions in tool descriptions
  toolPoisoning: {
    patterns: [
      // Hidden instructions in descriptions
      /description\s*:\s*['"`][^'"]*(?:ignore|disregard|forget)\s+(?:previous|all|other)\s+(?:instructions|rules)/gi,
      // System prompts in descriptions
      /description\s*:\s*['"`][^'"]*(?:system\s*:|<\s*system\s*>|SYSTEM:)/gi,
      // Executable content in tool descriptions
      /description\s*:\s*['"`][^'"]*(?:sudo|rm\s+-rf|eval|exec|chmod|curl\s+.*\|)/gi,
      // Injection markers
      /description\s*:\s*['"`][^'"]*(?:\{\{|<%|<\?|<script)/gi,
      // Hidden unicode characters
      /description\s*:\s*['"`][^'"]*[\u200B-\u200F\u2028-\u202F\uFEFF]/g
    ],
    severity: 'critical' as const,
    category: 'Tool Poisoning',
    suggestion: 'Remove hidden instructions from tool descriptions. Tool descriptions should only describe functionality, not contain executable instructions.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Prompt Injection: User input that could manipulate LLM behavior
  promptInjection: {
    patterns: [
      // Direct prompt injection patterns
      /input.*['"`].*(?:ignore|disregard|forget)\s+(?:previous|all|other)/gi,
      // System prompt manipulation
      /['"`][^'"]*(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|new\s+instructions)/gi,
      // Template injection markers in tool inputs
      /\$\{.*(?:process\.env|require|import|eval)/g,
      // CRLF injection
      /input.*\r\n|\n\r/g
    ],
    severity: 'critical' as const,
    category: 'Prompt Injection',
    suggestion: 'Sanitize all user inputs. Use input validation schemas with strict constraints. Consider using output encoding.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Rug Pull: Tool behavior changes after trust is established
  rugPull: {
    patterns: [
      // Dynamic tool registration changes
      /(?:setTimeout|setInterval).*(?:registerTool|addTool|updateTool)/g,
      // Conditional tool behavior based on invocation count
      /invocationCount|callCount|executionCount/g,
      // Dynamic code loading after initialization
      /(?:setTimeout|setInterval).*(?:require|import|eval)/g,
      // Tool description changes at runtime
      /tool\.description\s*=/g,
      // Input schema modification after registration
      /inputSchema\s*=\s*(?!.*const)/g
    ],
    severity: 'high' as const,
    category: 'Rug Pull Detection',
    suggestion: 'Ensure tool behavior is consistent. Avoid dynamic modification of tool definitions after registration.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Excessive Agency: Tools with too much autonomous power
  excessiveAgency: {
    patterns: [
      // File system operations without path restrictions
      /fs\.(?:rm|rmdir|unlink|writeFile|appendFile).*(?:input|params|args)/g,
      // Network requests with user-controlled URLs
      /(?:fetch|axios|http\.request)\s*\(\s*(?:input|params|args)/g,
      // Database operations without parameterization
      /(?:execute|query)\s*\(\s*(?:input|params|args)/g,
      // Process execution with user input
      /(?:spawn|exec|execFile)\s*\(\s*(?:input|params|args)/g
    ],
    severity: 'high' as const,
    category: 'Excessive Agency',
    suggestion: 'Limit tool capabilities. Use allowlists for file paths, URLs, and commands. Require explicit user confirmation for destructive operations.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Shadow Resources: Hidden or undocumented resources
  shadowResources: {
    patterns: [
      // Undocumented environment variable access
      /process\.env\[(?!.*\/\/\s*documented)/g,
      // Hidden file access patterns
      /\.(?:env|secret|credential|key)(?:\.local|\.prod)?/g,
      // Undeclared external service calls
      /(?:fetch|axios).*(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/g
    ],
    severity: 'medium' as const,
    category: 'Shadow Resources',
    suggestion: 'Document all resources accessed by tools. Use explicit resource declarations in MCP manifest.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Token Theft: Unauthorized access to auth tokens
  tokenTheft: {
    patterns: [
      // Logging tokens
      /(?:console|logger)\.(?:log|info|debug|warn)\s*\([^)]*(?:token|bearer|auth|credential)/gi,
      // Storing tokens in URLs
      /(?:url|href|src)\s*[+=].*(?:token|bearer|auth)/gi,
      // Exposing tokens in responses
      /res\.(?:send|json)\s*\([^)]*(?:accessToken|refreshToken|idToken)/g,
      // Token in query parameters
      /searchParams\.(?:set|append)\s*\([^)]*token/gi
    ],
    severity: 'high' as const,
    category: 'Token Theft',
    suggestion: 'Never log, expose, or transmit tokens insecurely. Use HTTP-only cookies or secure token storage.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Cross-Tool Leakage: Data leakage between tool invocations
  crossToolLeakage: {
    patterns: [
      // Global state modification
      /global\.\w+\s*=/g,
      // Shared mutable state
      /(?:let|var)\s+\w+\s*=.*(?:cache|store|state).*(?:export|module\.exports)/g,
      // Singleton with mutable data
      /static\s+(?:instance|data|cache)/g
    ],
    severity: 'medium' as const,
    category: 'Cross-Tool Leakage',
    suggestion: 'Isolate tool execution contexts. Avoid shared mutable state between tool invocations.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Missing Tool Input Validation
  missingToolValidation: {
    patterns: [
      // Tools without input schema
      /registerTool\s*\(\s*\{[^}]*(?!inputSchema)[^}]*\}\s*\)/g,
      // Empty input schemas
      /inputSchema\s*:\s*\{\s*\}/g,
      // Any type in schemas
      /type\s*:\s*['"]any['"]/g
    ],
    severity: 'medium' as const,
    category: 'Missing Tool Validation',
    suggestion: 'Define strict input schemas for all tools using JSON Schema with explicit type constraints.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Insecure Tool Registration
  insecureToolRegistration: {
    patterns: [
      // Dynamic tool registration from external sources
      /registerTool\s*\(\s*(?:await\s+)?(?:fetch|require|import)/g,
      // Tool registration without validation
      /registerTool\s*\(\s*(?!.*validate)/g,
      // Untrusted tool sources
      /tool.*url\s*:\s*['"`]http:\/\//g
    ],
    severity: 'high' as const,
    category: 'Insecure Tool Registration',
    suggestion: 'Only register tools from trusted sources. Validate tool definitions before registration.',
    reference: 'https://owasp.org/www-project-mcp-security/'
  },

  // Uncontrolled Resource Consumption
  uncontrolledResourceConsumption: {
    patterns: [
      // Unbounded loops
      /while\s*\(\s*true\s*\)/g,
      // Missing pagination limits
      /(?:findAll|find|query)\s*\([^)]*\)(?!.*limit)/g,
      // Large data operations without limits
      /(?:readFile|readdir)\s*\([^)]*\)(?!.*slice|limit|take)/g,
      // Recursive operations without depth limit
      /function\s+\w+[^{]*\{[^}]*\1\s*\(/g
    ],
    severity: 'medium' as const,
    category: 'Uncontrolled Resource Consumption',
    suggestion: 'Implement rate limiting, pagination, and resource quotas. Set timeouts for all operations.',
    reference: 'https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/'
  },

  // ===========================================
  // General Security Patterns
  // ===========================================

  // Hardcoded secrets
  hardcodedSecrets: {
    patterns: [
      /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi,
      /(?:secret|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /(?:aws[_-]?(?:access[_-]?key|secret))\s*[:=]\s*['"][^'"]+['"]/gi,
      /['"](?:sk-|pk_|rk_)[a-zA-Z0-9]{20,}['"]/g,
      /(?:bearer|authorization)\s*[:=]\s*['"][^'"]{20,}['"]/gi
    ],
    severity: 'critical' as const,
    category: 'Hardcoded Secrets',
    suggestion: 'Use environment variables for secrets. Example: process.env.API_KEY',
    reference: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/'
  },

  // SQL Injection
  sqlInjection: {
    patterns: [
      /query\s*\(\s*[`'"].*\$\{[^}]+\}/g,
      /execute\s*\(\s*[`'"].*\+\s*\w+/g,
      /SELECT.*FROM.*WHERE.*['"`]\s*\+/gi,
      /INSERT\s+INTO.*VALUES\s*\(.*\+/gi
    ],
    severity: 'critical' as const,
    category: 'SQL Injection',
    suggestion: 'Use parameterized queries. Example: db.query("SELECT * FROM users WHERE id = $1", [userId])',
    reference: 'https://owasp.org/Top10/A03_2021-Injection/'
  },

  // Command Injection
  commandInjection: {
    patterns: [
      /exec\s*\(\s*[`'"].*\$\{[^}]+\}/g,
      /spawn\s*\(\s*[^,]+,\s*\[.*\$\{/g,
      /child_process.*exec.*\+/g,
      /eval\s*\([^)]*\+/g
    ],
    severity: 'critical' as const,
    category: 'Command Injection',
    suggestion: 'Avoid exec() with user input. Use spawn() with argument array and validate inputs.',
    reference: 'https://owasp.org/Top10/A03_2021-Injection/'
  },

  // Missing Input Validation
  missingValidation: {
    patterns: [
      /async\s+execute\s*\([^)]*\)\s*(?::\s*Promise[^{]*)?\s*\{[^}]*(?:fetch|axios|request)\s*\(\s*(?:input|params|args)\./g
    ],
    severity: 'high' as const,
    category: 'Missing Input Validation',
    suggestion: 'Validate and sanitize all inputs before use. Check against schema.',
    reference: 'https://owasp.org/Top10/A03_2021-Injection/'
  },

  // Insecure Randomness
  insecureRandom: {
    patterns: [
      /Math\.random\s*\(\)/g
    ],
    severity: 'medium' as const,
    category: 'Insecure Randomness',
    suggestion: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive random values.',
    reference: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/'
  },

  // Missing Rate Limiting
  missingRateLimit: {
    patterns: [
      /createServer\s*\([^)]*\)/g
    ],
    severity: 'medium' as const,
    category: 'Missing Rate Limiting',
    suggestion: 'Implement rate limiting for API endpoints. Use express-rate-limit or similar.',
    reference: 'https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/'
  },

  // Unsafe Deserialization
  unsafeDeserialize: {
    patterns: [
      /JSON\.parse\s*\([^)]*\)\s*(?!.*catch)/g,
      /eval\s*\(/g,
      /new\s+Function\s*\(/g
    ],
    severity: 'high' as const,
    category: 'Unsafe Deserialization',
    suggestion: 'Wrap JSON.parse in try-catch. Never use eval() on user input.',
    reference: 'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/'
  },

  // Path Traversal
  pathTraversal: {
    patterns: [
      /path\.join\s*\([^)]*(?:input|params|args|req\.)/g,
      /fs\.(?:read|write).*\+.*(?:input|params)/g,
      /\.\.\//g
    ],
    severity: 'high' as const,
    category: 'Path Traversal',
    suggestion: 'Validate and sanitize file paths. Use path.normalize() and check for "..".',
    reference: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/'
  },

  // Missing Authentication Check
  missingAuthCheck: {
    patterns: [
      /app\.(?:get|post|put|delete)\s*\([^)]+,\s*(?:async\s*)?\([^)]*\)\s*=>/g
    ],
    severity: 'medium' as const,
    category: 'Missing Authentication',
    suggestion: 'Add authentication middleware to protected routes.',
    reference: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/'
  },

  // Sensitive Data Exposure
  sensitiveDataExposure: {
    patterns: [
      /console\.(?:log|info|debug)\s*\([^)]*(?:password|secret|token|key|auth)/gi,
      /logger\.(?:info|debug)\s*\([^)]*(?:password|secret|token|key)/gi
    ],
    severity: 'medium' as const,
    category: 'Sensitive Data Exposure',
    suggestion: 'Never log sensitive data. Mask or redact sensitive fields.',
    reference: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/'
  },

  // Missing Error Handling
  missingErrorHandling: {
    patterns: [
      /await\s+\w+\s*\([^)]*\)\s*(?!\.catch|;[\s\S]*?catch)/g
    ],
    severity: 'low' as const,
    category: 'Missing Error Handling',
    suggestion: 'Add try-catch blocks or .catch() for async operations.',
    reference: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/'
  }
};

/**
 * Scan a file for security issues
 */
async function scanFile(filePath: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const [checkName, check] of Object.entries(SECURITY_PATTERNS)) {
      for (const pattern of check.patterns) {
        // Reset regex state
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(content)) !== null) {
          // Find line number
          const beforeMatch = content.slice(0, match.index);
          const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

          // Skip if in comments
          const line = lines[lineNumber - 1] || '';
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            continue;
          }

          issues.push({
            severity: check.severity,
            category: check.category,
            file: filePath,
            line: lineNumber,
            message: `Potential ${check.category.toLowerCase()} detected: ${match[0].slice(0, 50)}...`,
            suggestion: check.suggestion,
            reference: check.reference
          });
        }
      }
    }
  } catch (error) {
    // File read error - skip
  }

  return issues;
}

/**
 * Check OAuth PKCE implementation
 */
async function checkOAuthImplementation(projectPath: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  const authFiles = [
    path.join(projectPath, 'src', 'auth', 'oauth-pkce.ts'),
    path.join(projectPath, 'src', 'auth', 'middleware.ts')
  ];

  for (const filePath of authFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for PKCE verifier
      if (!content.includes('codeVerifier') && !content.includes('code_verifier')) {
        issues.push({
          severity: 'high',
          category: 'OAuth PKCE',
          file: filePath,
          message: 'Missing PKCE code verifier in OAuth implementation',
          suggestion: 'Implement PKCE with S256 challenge method per RFC 7636'
        });
      }

      // Check for state parameter
      if (!content.includes('state')) {
        issues.push({
          severity: 'medium',
          category: 'OAuth Security',
          file: filePath,
          message: 'Missing state parameter for CSRF protection',
          suggestion: 'Add state parameter to prevent CSRF attacks'
        });
      }
    } catch {
      // File doesn't exist - that's OK for non-enterprise templates
    }
  }

  return issues;
}

/**
 * Check for proper input validation
 */
async function checkInputValidation(projectPath: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  const toolsDir = path.join(projectPath, 'src', 'tools');

  try {
    const files = await fs.readdir(toolsDir);

    for (const file of files) {
      if (!file.endsWith('.ts')) continue;

      const filePath = path.join(toolsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for additionalProperties: false
      if (content.includes('inputSchema') && !content.includes('additionalProperties')) {
        issues.push({
          severity: 'medium',
          category: 'Input Validation',
          file: filePath,
          message: 'Input schema missing additionalProperties: false',
          suggestion: 'Add additionalProperties: false to reject unknown fields'
        });
      }

      // Check for maxLength on string inputs
      if (content.includes("type: 'string'") && !content.includes('maxLength')) {
        issues.push({
          severity: 'low',
          category: 'Input Validation',
          file: filePath,
          message: 'String inputs missing maxLength constraint',
          suggestion: 'Add maxLength to prevent DoS via large inputs'
        });
      }
    }
  } catch {
    // Tools directory doesn't exist
  }

  return issues;
}

/**
 * Run full security audit on a project
 */
export async function runSecurityAudit(projectPath: string): Promise<SecurityReport> {
  const issues: SecurityIssue[] = [];

  // Find all TypeScript files
  const srcDir = path.join(projectPath, 'src');

  async function walkDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          files.push(...await walkDir(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }

  const tsFiles = await walkDir(srcDir);

  // Scan each file
  for (const file of tsFiles) {
    const fileIssues = await scanFile(file);
    issues.push(...fileIssues);
  }

  // Additional checks
  issues.push(...await checkOAuthImplementation(projectPath));
  issues.push(...await checkInputValidation(projectPath));

  // Calculate summary
  const summary = {
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length,
    total: issues.length
  };

  return {
    timestamp: new Date().toISOString(),
    projectPath,
    issues,
    summary,
    passed: summary.critical === 0 && summary.high === 0
  };
}

/**
 * Format security report as markdown
 */
export function formatSecurityReport(report: SecurityReport): string {
  let markdown = `# Security Audit Report

**Date**: ${report.timestamp}
**Project**: ${report.projectPath}
**Status**: ${report.passed ? '✅ PASSED' : '❌ FAILED'}

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${report.summary.critical} |
| 🟠 High | ${report.summary.high} |
| 🟡 Medium | ${report.summary.medium} |
| 🔵 Low | ${report.summary.low} |
| **Total** | **${report.summary.total}** |

`;

  if (report.issues.length === 0) {
    markdown += '\n## No security issues found! 🎉\n';
    return markdown;
  }

  markdown += '\n## Issues Found\n\n';

  // Group by severity
  const severityOrder = ['critical', 'high', 'medium', 'low'] as const;

  for (const severity of severityOrder) {
    const severityIssues = report.issues.filter(i => i.severity === severity);
    if (severityIssues.length === 0) continue;

    const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[severity];
    markdown += `### ${emoji} ${severity.toUpperCase()} (${severityIssues.length})\n\n`;

    for (const issue of severityIssues) {
      markdown += `#### ${issue.category}\n`;
      markdown += `- **File**: \`${issue.file}\`${issue.line ? `:${issue.line}` : ''}\n`;
      markdown += `- **Issue**: ${issue.message}\n`;
      markdown += `- **Fix**: ${issue.suggestion}\n`;
      if (issue.reference) {
        markdown += `- **Reference**: ${issue.reference}\n`;
      }
      markdown += '\n';
    }
  }

  return markdown;
}

export { SECURITY_PATTERNS };
