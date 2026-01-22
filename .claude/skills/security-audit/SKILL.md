---
name: security-audit
description: Audit MCP servers for vulnerabilities, authentication gaps, and security best practices compliance. Use this to check for common security issues before deployment.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# MCP Security Audit Skill

## Purpose

Identify security vulnerabilities in MCP server implementations. Based on 2025 research findings where 2000+ MCP servers were found exposed without authentication (Knostic), this skill checks for critical security patterns.

## Audit Categories

### 1. Authentication Audit

**Checks:**
- [ ] OAuth 2.0 implementation present
- [ ] PKCE flow implemented (mandatory per 2025 spec)
- [ ] Resource Indicators configured
- [ ] Token validation on every request
- [ ] Refresh token rotation enabled
- [ ] Token expiration < 1 hour

**Grep Patterns:**
```bash
# Check for OAuth implementation
grep -rn "oauth\|OAuth\|PKCE\|pkce" src/ --include="*.ts"

# Check for token validation
grep -rn "validateToken\|verifyToken\|jwt.verify" src/ --include="*.ts"
```

### 2. Input Validation Audit

**Checks:**
- [ ] JSON Schema validation on all tool inputs
- [ ] Maximum input length limits defined
- [ ] `additionalProperties: false` in schemas
- [ ] Type coercion prevention
- [ ] Injection pattern detection

**Grep Patterns:**
```bash
# Find tools without validation
grep -rn "execute.*input" src/tools/ --include="*.ts" | grep -v "validate"

# Check for additionalProperties
grep -rn "additionalProperties" src/ --include="*.ts"

# SQL injection risks
grep -rn "query.*\$\|execute.*\$\|sql.*\+" src/ --include="*.ts"
```

### 3. Secrets Management Audit

**Checks:**
- [ ] No hardcoded credentials in source
- [ ] .env.example exists (without actual secrets)
- [ ] Environment variables for all secrets
- [ ] .gitignore includes .env files
- [ ] No secrets in mcp-spec.json or config files

**Grep Patterns:**
```bash
# Hardcoded secrets
grep -rn "apiKey\s*=\s*['\"]" src/ --include="*.ts"
grep -rn "password\s*=\s*['\"]" src/ --include="*.ts"
grep -rn "secret\s*=\s*['\"]" src/ --include="*.ts"
grep -rn "token\s*=\s*['\"]" src/ --include="*.ts"

# API keys in config
grep -rn "sk-\|pk_\|Bearer " . --include="*.json" --include="*.ts"
```

### 4. Network Security Audit

**Checks:**
- [ ] HTTPS enforcement configured
- [ ] CORS properly restricted (not `*`)
- [ ] Rate limiting implemented
- [ ] Request timeout limits set
- [ ] Response size limits configured

**Grep Patterns:**
```bash
# Overly permissive CORS
grep -rn "Access-Control-Allow-Origin.*\*\|cors.*origin.*\*" src/ --include="*.ts"

# Rate limiting check
grep -rn "rateLimit\|rate-limit\|throttle" src/ --include="*.ts"
```

### 5. Capability-Based Access Control

**Checks:**
- [ ] Minimal permissions principle applied
- [ ] Capability scoping per tool
- [ ] User consent flows implemented
- [ ] Permission revocation handling

## Vulnerability Severity Levels

### CRITICAL (Immediate Fix Required)
1. **Exposed without authentication** - Server accessible without any auth
2. **Hardcoded secrets** - API keys, tokens in source code
3. **Command injection** - Unsanitized input in shell commands
4. **SQL injection** - Unsanitized input in database queries

### HIGH (Fix Before Production)
1. **Missing input validation** - Tools accepting any input
2. **Overly permissive CORS** - Allow-Origin: `*`
3. **No rate limiting** - Susceptible to DoS
4. **Verbose error messages** - Leaking internal details

### MEDIUM (Should Fix)
1. **Missing HTTPS** - Unencrypted transport
2. **No request logging** - Cannot detect attacks
3. **Weak token expiration** - Long-lived tokens (>1 hour)
4. **Missing health checks** - Cannot detect compromise

### LOW (Best Practice)
1. **Missing security headers** - X-Frame-Options, CSP
2. **Outdated dependencies** - Known vulnerabilities
3. **No audit trail** - Missing operation logging

## Audit Report Format

```markdown
# Security Audit Report: {project-name}
**Date**: {date}
**Auditor**: Claude Security Audit Skill

## Executive Summary
- **Critical**: X issues
- **High**: X issues
- **Medium**: X issues
- **Low**: X issues

## Findings

### [CRITICAL] {Issue Title}
**Location**: `path/to/file.ts:line`
**Description**: What the vulnerability is
**Impact**: What an attacker could do
**Evidence**:
```
code snippet showing the issue
```
**Remediation**:
```typescript
// Fixed code
```
**Reference**: [OWASP Link or Best Practice]

---

## Compliance Checklist

| Check | Status | Notes |
|-------|--------|-------|
| OAuth 2.0 PKCE | PASS/FAIL | |
| Input Validation | PASS/FAIL | |
| Secrets Management | PASS/FAIL | |
| Network Security | PASS/FAIL | |
| Rate Limiting | PASS/FAIL | |
| Audit Logging | PASS/FAIL | |

## Recommendations Priority

1. [CRITICAL] Fix X immediately
2. [HIGH] Address Y before deployment
3. [MEDIUM] Schedule Z for next sprint
```

## Quick Audit Commands

### Full Security Scan
```bash
# Run all security checks
grep -rn "password\|secret\|apiKey\|token" src/ --include="*.ts" | grep -v "\.test\."
grep -rn "eval\|exec\|spawn" src/ --include="*.ts"
grep -rn "innerHTML\|dangerouslySetInnerHTML" src/ --include="*.ts"
```

### Authentication Check
```bash
# Verify auth is required
grep -rn "authenticate\|authorize\|requireAuth" src/ --include="*.ts"
```

### Dependency Audit
```bash
npm audit
npm outdated
```

## Reference Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [MCP Security Best Practices](https://modelcontextprotocol.info/docs/best-practices/)
- [OAuth 2.0 PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
