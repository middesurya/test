/**
 * MCP Registry Client
 * Handles publishing and validation for registry.modelcontextprotocol.io
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface RegistryManifest {
  name: string;
  displayName?: string;
  description: string;
  version: string;
  vendor?: string;
  repository?: string;
  homepage?: string;
  license?: string;
  tools?: RegistryTool[];
  resources?: RegistryResource[];
  prompts?: RegistryPrompt[];
  transport: ('stdio' | 'streamable-http')[];
  mcpVersion?: string;
  keywords?: string[];
}

export interface RegistryTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface RegistryResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface RegistryPrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface PublishOptions {
  dryRun?: boolean;
  registryUrl?: string;
  token?: string;
  force?: boolean;
}

export interface PublishResult {
  success: boolean;
  message: string;
  url?: string;
}

const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';
const REGISTRY_API_VERSION = 'v0.1';

/**
 * Validate a registry manifest
 */
export function validateManifest(manifest: Partial<RegistryManifest>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required fields
  if (!manifest.name) {
    errors.push({ field: 'name', message: 'name is required' });
  } else if (!/^[a-z0-9-]+$/.test(manifest.name)) {
    errors.push({ field: 'name', message: 'name must be lowercase alphanumeric with hyphens' });
  }

  if (!manifest.description) {
    errors.push({ field: 'description', message: 'description is required' });
  } else if (manifest.description.length < 10) {
    warnings.push({ field: 'description', message: 'description should be at least 10 characters' });
  }

  if (!manifest.version) {
    errors.push({ field: 'version', message: 'version is required' });
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push({ field: 'version', message: 'version must be valid semver (e.g., 1.0.0)' });
  }

  if (!manifest.transport || manifest.transport.length === 0) {
    errors.push({ field: 'transport', message: 'at least one transport type is required' });
  } else {
    const validTransports = ['stdio', 'streamable-http'];
    for (const t of manifest.transport) {
      if (!validTransports.includes(t)) {
        errors.push({ field: 'transport', message: `invalid transport: ${t}` });
      }
    }
  }

  // Recommended fields
  if (!manifest.repository) {
    warnings.push({ field: 'repository', message: 'repository URL is recommended' });
  }

  if (!manifest.license) {
    warnings.push({ field: 'license', message: 'license is recommended (e.g., MIT, Apache-2.0)' });
  }

  if (!manifest.keywords || manifest.keywords.length === 0) {
    warnings.push({ field: 'keywords', message: 'keywords are recommended for discoverability' });
  }

  // Validate tools if present
  if (manifest.tools) {
    for (let i = 0; i < manifest.tools.length; i++) {
      const tool = manifest.tools[i];
      if (!tool.name) {
        errors.push({ field: `tools[${i}].name`, message: 'tool name is required' });
      }
      if (!tool.description) {
        errors.push({ field: `tools[${i}].description`, message: 'tool description is required' });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate a manifest from project files
 */
export async function generateManifest(projectPath: string): Promise<RegistryManifest> {
  // Read package.json
  const packageJsonPath = path.join(projectPath, 'package.json');
  let packageJson: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    // package.json not found, use defaults
  }

  // Try to read mcp-spec.json for tools/resources
  const mcpSpecPath = path.join(projectPath, 'mcp-spec.json');
  let mcpSpec: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(mcpSpecPath, 'utf-8');
    mcpSpec = JSON.parse(content);
  } catch {
    // mcp-spec.json not found
  }

  // Detect transport from source files
  const transport: ('stdio' | 'streamable-http')[] = ['stdio'];
  try {
    const srcIndex = path.join(projectPath, 'src', 'index.ts');
    const content = await fs.readFile(srcIndex, 'utf-8');
    if (content.includes('streamable-http') || content.includes('express') || content.includes('http')) {
      transport.push('streamable-http');
    }
  } catch {
    // src/index.ts not found
  }

  // Build manifest
  const manifest: RegistryManifest = {
    name: (packageJson.name as string) || path.basename(projectPath),
    displayName: (packageJson.displayName as string) || undefined,
    description: (packageJson.description as string) || 'An MCP server',
    version: (packageJson.version as string) || '1.0.0',
    repository: typeof packageJson.repository === 'string'
      ? packageJson.repository
      : (packageJson.repository as Record<string, string>)?.url,
    homepage: packageJson.homepage as string,
    license: packageJson.license as string,
    vendor: packageJson.author as string,
    transport,
    mcpVersion: '2025-03-26',
    keywords: packageJson.keywords as string[]
  };

  // Add tools from mcp-spec
  if (mcpSpec.tools && Array.isArray(mcpSpec.tools)) {
    manifest.tools = mcpSpec.tools as RegistryTool[];
  }

  // Add resources from mcp-spec
  if (mcpSpec.resources && Array.isArray(mcpSpec.resources)) {
    manifest.resources = mcpSpec.resources as RegistryResource[];
  }

  // Add prompts from mcp-spec
  if (mcpSpec.prompts && Array.isArray(mcpSpec.prompts)) {
    manifest.prompts = mcpSpec.prompts as RegistryPrompt[];
  }

  return manifest;
}

/**
 * Publish manifest to MCP Registry
 */
export async function publishToRegistry(
  manifest: RegistryManifest,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const {
    dryRun = false,
    registryUrl = DEFAULT_REGISTRY_URL,
    token,
    force = false
  } = options;

  // Validate first
  const validation = validateManifest(manifest);

  if (!validation.valid) {
    return {
      success: false,
      message: `Validation failed:\n${validation.errors.map(e => `  - ${e.field}: ${e.message}`).join('\n')}`
    };
  }

  if (validation.warnings.length > 0 && !force) {
    const warningMsg = validation.warnings.map(w => `  - ${w.field}: ${w.message}`).join('\n');
    return {
      success: false,
      message: `Validation warnings (use --force to override):\n${warningMsg}`
    };
  }

  if (dryRun) {
    return {
      success: true,
      message: 'Validation passed (dry run)'
    };
  }

  // Require token for actual publish
  if (!token) {
    return {
      success: false,
      message: 'Registry token required. Set MCP_REGISTRY_TOKEN environment variable or use --token'
    };
  }

  // Publish to registry
  try {
    const response = await fetch(`${registryUrl}/api/${REGISTRY_API_VERSION}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(manifest)
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Registry error: ${error}`
      };
    }

    const result = await response.json() as { url?: string };
    return {
      success: true,
      message: 'Published successfully!',
      url: result.url || `${registryUrl}/servers/${manifest.name}`
    };
  } catch (error) {
    return {
      success: false,
      message: `Network error: ${(error as Error).message}`
    };
  }
}

/**
 * Fetch server info from registry
 */
export async function fetchServerInfo(
  serverName: string,
  options: { registryUrl?: string; timeout?: number } = {}
): Promise<RegistryManifest | null> {
  const { registryUrl = DEFAULT_REGISTRY_URL, timeout = 10000 } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(
      `${registryUrl}/api/${REGISTRY_API_VERSION}/servers/${serverName}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json() as RegistryManifest;
  } catch {
    return null;
  }
}

/**
 * Save manifest to file
 */
export async function saveManifest(
  manifest: RegistryManifest,
  projectPath: string
): Promise<void> {
  const manifestPath = path.join(projectPath, 'registry.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Load manifest from file
 */
export async function loadManifest(projectPath: string): Promise<RegistryManifest | null> {
  try {
    const manifestPath = path.join(projectPath, 'registry.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as RegistryManifest;
  } catch {
    return null;
  }
}
