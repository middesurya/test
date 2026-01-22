/**
 * Multi-Provider Secrets Manager
 * Supports AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, and local env
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Supported secrets providers
 */
export type SecretsProvider = 'aws' | 'vault' | 'azure' | 'env' | 'file';

/**
 * Secrets manager configuration
 */
export interface SecretsManagerConfig {
  provider: SecretsProvider;
  /** AWS-specific config */
  aws?: {
    region: string;
    secretPrefix?: string;
  };
  /** HashiCorp Vault config */
  vault?: {
    address: string;
    token?: string;
    namespace?: string;
    mountPath?: string;
  };
  /** Azure Key Vault config */
  azure?: {
    vaultUrl: string;
    tenantId?: string;
    clientId?: string;
  };
  /** File-based config (for development) */
  file?: {
    path: string;
  };
  /** Cache settings */
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
  };
  /** Fallback provider */
  fallback?: SecretsProvider;
}

/**
 * Secret value with metadata
 */
export interface SecretValue {
  value: string;
  version?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

/**
 * Cache entry
 */
interface CacheEntry {
  value: SecretValue;
  fetchedAt: number;
}

/**
 * Secrets Manager
 */
export class SecretsManager {
  private config: SecretsManagerConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private initialized: boolean = false;

  constructor(config: SecretsManagerConfig) {
    this.config = {
      cache: { enabled: true, ttlSeconds: 300 },
      ...config,
    };
  }

  /**
   * Initialize the secrets manager
   */
  async initialize(): Promise<void> {
    // Validate provider-specific configuration
    switch (this.config.provider) {
      case 'aws':
        if (!this.config.aws?.region) {
          throw new Error('AWS region is required');
        }
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
          throw new Error('AWS credentials not found in environment');
        }
        break;

      case 'vault':
        if (!this.config.vault?.address) {
          throw new Error('Vault address is required');
        }
        if (!this.config.vault?.token && !process.env.VAULT_TOKEN) {
          throw new Error('Vault token is required');
        }
        break;

      case 'azure':
        if (!this.config.azure?.vaultUrl) {
          throw new Error('Azure Key Vault URL is required');
        }
        break;

      case 'file':
        if (!this.config.file?.path) {
          throw new Error('Secrets file path is required');
        }
        break;

      case 'env':
        // No initialization needed
        break;
    }

    this.initialized = true;
  }

  /**
   * Get a secret value
   */
  async getSecret(key: string): Promise<SecretValue | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache
    if (this.config.cache?.enabled) {
      const cached = this.getFromCache(key);
      if (cached) {
        return cached;
      }
    }

    // Fetch from provider
    try {
      const value = await this.fetchSecret(key);
      if (value && this.config.cache?.enabled) {
        this.setCache(key, value);
      }
      return value;
    } catch (error) {
      // Try fallback provider
      if (this.config.fallback && this.config.fallback !== this.config.provider) {
        return this.fetchSecretFromFallback(key);
      }
      throw error;
    }
  }

  /**
   * Get multiple secrets
   */
  async getSecrets(keys: string[]): Promise<Map<string, SecretValue | null>> {
    const results = new Map<string, SecretValue | null>();
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.getSecret(key);
        results.set(key, value);
      })
    );
    return results;
  }

  /**
   * Set a secret (provider-dependent)
   */
  async setSecret(key: string, value: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    switch (this.config.provider) {
      case 'env':
        process.env[key] = value;
        break;

      case 'file':
        await this.setFileSecret(key, value);
        break;

      case 'aws':
      case 'vault':
      case 'azure':
        throw new Error(`setSecret not implemented for ${this.config.provider}`);
    }

    // Update cache
    if (this.config.cache?.enabled) {
      this.setCache(key, { value });
    }
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(key: string, newValue: string): Promise<void> {
    await this.setSecret(key, newValue);
    // Clear any cached value
    this.cache.delete(key);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Inject secrets into process.env
   */
  async injectIntoEnv(mapping: Record<string, string>): Promise<void> {
    for (const [envVar, secretKey] of Object.entries(mapping)) {
      const secret = await this.getSecret(secretKey);
      if (secret) {
        process.env[envVar] = secret.value;
      }
    }
  }

  // ===========================================
  // Private methods
  // ===========================================

  private getFromCache(key: string): SecretValue | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ttl = (this.config.cache?.ttlSeconds || 300) * 1000;
    if (Date.now() - entry.fetchedAt > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCache(key: string, value: SecretValue): void {
    this.cache.set(key, { value, fetchedAt: Date.now() });
  }

  private async fetchSecret(key: string): Promise<SecretValue | null> {
    switch (this.config.provider) {
      case 'env':
        return this.fetchEnvSecret(key);
      case 'file':
        return this.fetchFileSecret(key);
      case 'aws':
        return this.fetchAwsSecret(key);
      case 'vault':
        return this.fetchVaultSecret(key);
      case 'azure':
        return this.fetchAzureSecret(key);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  private fetchEnvSecret(key: string): SecretValue | null {
    const value = process.env[key];
    return value ? { value } : null;
  }

  private async fetchFileSecret(key: string): Promise<SecretValue | null> {
    try {
      const content = await fs.readFile(this.config.file!.path, 'utf-8');
      const secrets = JSON.parse(content);
      const value = secrets[key];
      return value ? { value: String(value) } : null;
    } catch {
      return null;
    }
  }

  private async setFileSecret(key: string, value: string): Promise<void> {
    let secrets: Record<string, string> = {};
    try {
      const content = await fs.readFile(this.config.file!.path, 'utf-8');
      secrets = JSON.parse(content);
    } catch {
      // File doesn't exist, create new
    }

    secrets[key] = value;
    await fs.writeFile(this.config.file!.path, JSON.stringify(secrets, null, 2));
  }

  private async fetchAwsSecret(key: string): Promise<SecretValue | null> {
    // This is a stub - in production, use @aws-sdk/client-secrets-manager
    const prefix = this.config.aws?.secretPrefix || '';
    const secretId = prefix + key;

    // Simulate AWS Secrets Manager API call
    // In production: const client = new SecretsManagerClient({ region: this.config.aws.region });
    console.log(`[AWS] Would fetch secret: ${secretId}`);
    return this.fetchEnvSecret(`AWS_SECRET_${key}`);
  }

  private async fetchVaultSecret(key: string): Promise<SecretValue | null> {
    // This is a stub - in production, use node-vault or @hashicorp/vault-client
    const address = this.config.vault!.address;
    const mountPath = this.config.vault?.mountPath || 'secret';
    const token = this.config.vault?.token || process.env.VAULT_TOKEN;

    // Simulate Vault API call
    console.log(`[Vault] Would fetch secret from ${address}/${mountPath}/${key}`);
    return this.fetchEnvSecret(`VAULT_SECRET_${key}`);
  }

  private async fetchAzureSecret(key: string): Promise<SecretValue | null> {
    // This is a stub - in production, use @azure/keyvault-secrets
    const vaultUrl = this.config.azure!.vaultUrl;

    // Simulate Azure Key Vault API call
    console.log(`[Azure] Would fetch secret from ${vaultUrl}/secrets/${key}`);
    return this.fetchEnvSecret(`AZURE_SECRET_${key}`);
  }

  private async fetchSecretFromFallback(key: string): Promise<SecretValue | null> {
    const originalProvider = this.config.provider;
    this.config.provider = this.config.fallback!;
    try {
      return await this.fetchSecret(key);
    } finally {
      this.config.provider = originalProvider;
    }
  }

  /**
   * Create from config file
   */
  static async fromConfigFile(configPath: string): Promise<SecretsManager> {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as SecretsManagerConfig;
    return new SecretsManager(config);
  }
}

/**
 * Initialize secrets config file
 */
export async function initSecretsConfig(
  projectPath: string,
  provider: SecretsProvider
): Promise<string> {
  const config: SecretsManagerConfig = {
    provider,
    cache: { enabled: true, ttlSeconds: 300 },
  };

  switch (provider) {
    case 'aws':
      config.aws = {
        region: process.env.AWS_REGION || 'us-east-1',
        secretPrefix: path.basename(projectPath) + '/',
      };
      break;

    case 'vault':
      config.vault = {
        address: process.env.VAULT_ADDR || 'http://localhost:8200',
        mountPath: 'secret',
      };
      break;

    case 'azure':
      config.azure = {
        vaultUrl: process.env.AZURE_KEY_VAULT_URL || 'https://your-vault.vault.azure.net',
      };
      break;

    case 'file':
      config.file = { path: '.secrets.json' };
      config.fallback = 'env';
      break;

    case 'env':
      config.fallback = 'file';
      config.file = { path: '.secrets.json' };
      break;
  }

  const configPath = path.join(projectPath, '.secrets-config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  // Add to .gitignore
  await updateGitignore(projectPath, ['.secrets-config.json', '.secrets.json']);

  return configPath;
}

/**
 * Create secrets template file
 */
export async function createSecretsTemplate(projectPath: string): Promise<void> {
  const templatePath = path.join(projectPath, '.secrets.json.example');
  const template = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    API_KEY: 'your-api-key-here',
    JWT_SECRET: 'your-jwt-secret-here',
  };

  await fs.writeFile(templatePath, JSON.stringify(template, null, 2));
}

/**
 * Update .gitignore
 */
async function updateGitignore(projectPath: string, entries: string[]): Promise<void> {
  const gitignorePath = path.join(projectPath, '.gitignore');
  let content = '';

  try {
    content = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  const lines = content.split('\n');
  const toAdd = entries.filter(e => !lines.includes(e));

  if (toAdd.length > 0) {
    const newContent = content + (content.endsWith('\n') ? '' : '\n') +
      '# Secrets\n' + toAdd.join('\n') + '\n';
    await fs.writeFile(gitignorePath, newContent);
  }
}

export { updateGitignore };
