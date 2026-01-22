/**
 * Secrets Management Commands
 * Initialize and manage secrets providers
 */

import { Command } from 'commander';
import ora from 'ora';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  initSecretsConfig,
  createSecretsTemplate,
  SecretsManager,
  SecretsProvider,
} from '../utils/secrets-manager';

interface InitOptions {
  provider?: SecretsProvider;
  force?: boolean;
}

interface RotateOptions {
  secret: string;
  value?: string;
  generate?: boolean;
}

// Main secrets command
export const secretsCommand = new Command('secrets')
  .description('Secrets management utilities');

// ===========================================
// Init Subcommand
// ===========================================

secretsCommand
  .command('init')
  .description('Initialize secrets provider configuration')
  .argument('[path]', 'Path to project', '.')
  .option('-p, --provider <provider>', 'Secrets provider (aws, vault, azure, env, file)')
  .option('--force', 'Overwrite existing configuration')
  .action(async (projectPath: string, options: InitOptions) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora('Initializing secrets configuration...').start();

    try {
      let provider = options.provider as SecretsProvider | undefined;

      // Interactive provider selection if not specified
      if (!provider) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select secrets provider:',
            choices: [
              { name: 'Environment Variables (recommended for dev)', value: 'env' },
              { name: 'Local File (.secrets.json)', value: 'file' },
              { name: 'AWS Secrets Manager', value: 'aws' },
              { name: 'HashiCorp Vault', value: 'vault' },
              { name: 'Azure Key Vault', value: 'azure' },
            ],
          },
        ]);
        provider = answers.provider;
        spinner.start();
      }

      // Check for existing config
      const configPath = path.join(resolvedPath, '.secrets-config.json');
      try {
        await require('fs').promises.access(configPath);
        if (!options.force) {
          spinner.warn('Configuration already exists. Use --force to overwrite.');
          return;
        }
      } catch {
        // Config doesn't exist, continue
      }

      // Initialize configuration
      const createdPath = await initSecretsConfig(resolvedPath, provider!);

      // Create template file for file/env providers
      if (provider === 'file' || provider === 'env') {
        await createSecretsTemplate(resolvedPath);
      }

      spinner.succeed('Secrets configuration initialized');
      console.log(chalk.cyan('\nConfiguration:'));
      console.log(`  Provider: ${provider}`);
      console.log(`  Config file: ${path.relative(process.cwd(), createdPath)}`);

      // Provider-specific instructions
      console.log(chalk.cyan('\nNext steps:'));
      switch (provider) {
        case 'env':
          console.log('  1. Copy .secrets.json.example to .secrets.json');
          console.log('  2. Update .secrets.json with your actual secrets');
          console.log('  3. Or set environment variables directly');
          break;

        case 'file':
          console.log('  1. Copy .secrets.json.example to .secrets.json');
          console.log('  2. Update .secrets.json with your actual secrets');
          console.log(chalk.yellow('  ⚠️  Never commit .secrets.json to version control'));
          break;

        case 'aws':
          console.log('  1. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
          console.log('  2. Store secrets in AWS Secrets Manager with prefix');
          console.log('  3. Run: aws secretsmanager create-secret --name your-app/KEY --secret-string VALUE');
          break;

        case 'vault':
          console.log('  1. Set VAULT_ADDR and VAULT_TOKEN environment variables');
          console.log('  2. Store secrets in Vault: vault kv put secret/KEY value=VALUE');
          break;

        case 'azure':
          console.log('  1. Set AZURE_KEY_VAULT_URL environment variable');
          console.log('  2. Authenticate with Azure CLI: az login');
          console.log('  3. Store secrets: az keyvault secret set --vault-name VAULT --name KEY --value VALUE');
          break;
      }
    } catch (error) {
      spinner.fail('Failed to initialize secrets');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// ===========================================
// Rotate Subcommand
// ===========================================

secretsCommand
  .command('rotate')
  .description('Rotate a secret')
  .argument('[path]', 'Path to project', '.')
  .requiredOption('-s, --secret <name>', 'Secret name to rotate')
  .option('-v, --value <value>', 'New secret value')
  .option('-g, --generate', 'Generate a random value')
  .action(async (projectPath: string, options: RotateOptions) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora('Rotating secret...').start();

    try {
      // Load secrets manager
      const configPath = path.join(resolvedPath, '.secrets-config.json');
      const manager = await SecretsManager.fromConfigFile(configPath);
      await manager.initialize();

      // Get or generate new value
      let newValue = options.value;
      if (!newValue && options.generate) {
        newValue = generateSecureSecret();
      }

      if (!newValue) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'value',
            message: `Enter new value for ${options.secret}:`,
            mask: '*',
          },
        ]);
        newValue = answers.value;
        spinner.start();
      }

      // Rotate the secret
      await manager.rotateSecret(options.secret, newValue!);

      spinner.succeed(`Secret "${options.secret}" rotated successfully`);
      console.log(chalk.yellow('\n⚠️  Remember to restart your application to pick up the new value'));
    } catch (error) {
      spinner.fail('Failed to rotate secret');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// ===========================================
// Check Subcommand
// ===========================================

secretsCommand
  .command('check')
  .description('Check secrets configuration')
  .argument('[path]', 'Path to project', '.')
  .action(async (projectPath: string) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora('Checking secrets configuration...').start();

    try {
      // Load secrets manager
      const configPath = path.join(resolvedPath, '.secrets-config.json');
      const manager = await SecretsManager.fromConfigFile(configPath);
      await manager.initialize();

      spinner.succeed('Secrets configuration is valid');
      console.log(chalk.green('\n✓ Configuration file found'));
      console.log(chalk.green('✓ Provider initialized successfully'));
    } catch (error) {
      spinner.fail('Secrets configuration check failed');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// ===========================================
// Helper Functions
// ===========================================

function generateSecureSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = require('crypto').randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ===========================================
// Shorthand Commands
// ===========================================

export const secretsInitCommand = new Command('secrets:init')
  .description('Initialize secrets provider (shorthand)')
  .argument('[path]', 'Path to project', '.')
  .option('-p, --provider <provider>', 'Provider (aws, vault, azure, env, file)')
  .option('--force', 'Overwrite existing')
  .action(async (projectPath: string, options: InitOptions) => {
    const initCmd = secretsCommand.commands.find(c => c.name() === 'init');
    await initCmd?.parseAsync([projectPath,
      ...(options.provider ? ['-p', options.provider] : []),
      ...(options.force ? ['--force'] : [])
    ], { from: 'user' });
  });

export const secretsRotateCommand = new Command('secrets:rotate')
  .description('Rotate a secret (shorthand)')
  .argument('[path]', 'Path to project', '.')
  .requiredOption('-s, --secret <name>', 'Secret name')
  .option('-v, --value <value>', 'New value')
  .option('-g, --generate', 'Generate random')
  .action(async (projectPath: string, options: RotateOptions) => {
    const rotateCmd = secretsCommand.commands.find(c => c.name() === 'rotate');
    await rotateCmd?.parseAsync([projectPath,
      '-s', options.secret,
      ...(options.value ? ['-v', options.value] : []),
      ...(options.generate ? ['-g'] : [])
    ], { from: 'user' });
  });
