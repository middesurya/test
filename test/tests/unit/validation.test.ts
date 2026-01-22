/**
 * Unit Tests for Validation Utilities
 */

import { validateProjectName, validateToolName } from '../../src/utils/validation';

describe('validateProjectName', () => {
  describe('valid names', () => {
    it('should accept simple lowercase name', () => {
      const result = validateProjectName('my-project');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept name with numbers', () => {
      const result = validateProjectName('project123');
      expect(result.valid).toBe(true);
    });

    it('should accept name with dots', () => {
      const result = validateProjectName('my.project');
      expect(result.valid).toBe(true);
    });

    it('should accept name with underscores', () => {
      const result = validateProjectName('my_project');
      expect(result.valid).toBe(true);
    });

    it('should accept scoped package name', () => {
      const result = validateProjectName('@scope/package');
      expect(result.valid).toBe(true);
    });

    it('should accept name starting with number', () => {
      const result = validateProjectName('123-project');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid names', () => {
    it('should reject empty string', () => {
      const result = validateProjectName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Project name cannot be empty');
    });

    it('should reject whitespace only', () => {
      const result = validateProjectName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Project name cannot be empty');
    });

    it('should reject uppercase letters', () => {
      const result = validateProjectName('MyProject');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject name with spaces', () => {
      const result = validateProjectName('my project');
      expect(result.valid).toBe(false);
    });

    it('should reject name exceeding 214 characters', () => {
      const longName = 'a'.repeat(215);
      const result = validateProjectName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('214 characters');
    });

    it('should reject reserved name: node_modules', () => {
      const result = validateProjectName('node_modules');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject reserved name: package.json', () => {
      const result = validateProjectName('package.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('should reject reserved name: favicon.ico', () => {
      const result = validateProjectName('favicon.ico');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });
  });

  describe('edge cases', () => {
    it('should accept exactly 214 characters', () => {
      const maxName = 'a'.repeat(214);
      const result = validateProjectName(maxName);
      expect(result.valid).toBe(true);
    });

    it('should accept single character name', () => {
      const result = validateProjectName('a');
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateToolName', () => {
  describe('valid names', () => {
    it('should accept simple kebab-case name', () => {
      const result = validateToolName('fetch-user');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept single word name', () => {
      const result = validateToolName('search');
      expect(result.valid).toBe(true);
    });

    it('should accept name with numbers', () => {
      const result = validateToolName('api2');
      expect(result.valid).toBe(true);
    });

    it('should accept name with multiple hyphens', () => {
      const result = validateToolName('get-user-by-id');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid names', () => {
    it('should reject empty string', () => {
      const result = validateToolName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tool name cannot be empty');
    });

    it('should reject whitespace only', () => {
      const result = validateToolName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tool name cannot be empty');
    });

    it('should reject name starting with number', () => {
      const result = validateToolName('123tool');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    it('should reject name starting with hyphen', () => {
      const result = validateToolName('-tool');
      expect(result.valid).toBe(false);
    });

    it('should reject uppercase letters', () => {
      const result = validateToolName('FetchUser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject underscores', () => {
      const result = validateToolName('fetch_user');
      expect(result.valid).toBe(false);
    });

    it('should reject spaces', () => {
      const result = validateToolName('fetch user');
      expect(result.valid).toBe(false);
    });

    it('should reject special characters', () => {
      const result = validateToolName('fetch@user');
      expect(result.valid).toBe(false);
    });

    it('should reject dots', () => {
      const result = validateToolName('fetch.user');
      expect(result.valid).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should accept single character name', () => {
      const result = validateToolName('a');
      expect(result.valid).toBe(true);
    });

    it('should accept long kebab-case name', () => {
      const result = validateToolName('very-long-tool-name-with-many-parts');
      expect(result.valid).toBe(true);
    });
  });
});
