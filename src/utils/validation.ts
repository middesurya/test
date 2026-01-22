interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateProjectName(name: string): ValidationResult {
  // Check if name is empty
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Project name cannot be empty' };
  }

  // Check for valid npm package name format
  const validNameRegex = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!validNameRegex.test(name)) {
    return {
      valid: false,
      error: 'Project name must be lowercase and can contain hyphens, underscores, and dots'
    };
  }

  // Check length
  if (name.length > 214) {
    return { valid: false, error: 'Project name cannot exceed 214 characters' };
  }

  // Check for reserved names
  const reservedNames = ['node_modules', 'favicon.ico', 'package.json'];
  if (reservedNames.includes(name)) {
    return { valid: false, error: `'${name}' is a reserved name` };
  }

  return { valid: true };
}

export function validateToolName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Tool name cannot be empty' };
  }

  const validNameRegex = /^[a-z][a-z0-9-]*$/;
  if (!validNameRegex.test(name)) {
    return {
      valid: false,
      error: 'Tool name must start with a letter and contain only lowercase letters, numbers, and hyphens'
    };
  }

  return { valid: true };
}
