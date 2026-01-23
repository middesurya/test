/**
 * Registry Command
 * Validate and interact with MCP Registry
 */

import { Command } from 'commander';
import ora from 'ora';
import path from 'path';
import chalk from 'chalk';
import {
  validateManifest,
  generateManifest,
  saveManifest,
  loadManifest,
  fetchServerInfo
} from '../utils/registry-client';

interface ValidateOptions {
  generate?: boolean;
  save?: boolean;
  strict?: boolean;
  json?: boolean;
}

interface InfoOptions {
  registry?: string;
  json?: boolean;
}

// Main registry command
export const registryCommand = new Command('registry')
  .description('MCP Registry operations');

// Subcommand: validate
registryCommand
  .command('validate')
  .description('Validate registry.json manifest')
  .argument('[path]', 'Path to MCP server project', '.')
  .option('--generate', 'Generate manifest from project if not found')
  .option('--save', 'Save generated manifest to registry.json')
  .option('--strict', 'Treat warnings as errors')
  .option('--json', 'Output as JSON')
  .action(async (projectPath: string, options: ValidateOptions) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = options.json ? null : ora('Loading manifest...').start();

    try {
      // Load or generate manifest
      let manifest = await loadManifest(resolvedPath);

      if (!manifest && options.generate) {
        spinner?.text && (spinner.text = 'Generating manifest...');
        manifest = await generateManifest(resolvedPath);
      }

      if (!manifest) {
        if (spinner) {
          spinner.fail('No registry.json found');
          console.log(chalk.yellow('\nUse --generate to create from project files'));
        } else {
          console.log(JSON.stringify({ valid: false, error: 'No registry.json found' }));
        }
        process.exit(1);
      }

      // Save if requested
      if (options.save) {
        await saveManifest(manifest, resolvedPath);
        spinner?.succeed('Manifest saved to registry.json');
      }

      // Validate
      const validation = validateManifest(manifest);

      if (options.json) {
        console.log(JSON.stringify({
          valid: validation.valid && (!options.strict || validation.warnings.length === 0),
          manifest,
          errors: validation.errors,
          warnings: validation.warnings
        }, null, 2));
        process.exit(validation.valid ? 0 : 1);
      }

      // Output results
      if (!validation.valid) {
        spinner?.fail('Validation failed');
        console.log(chalk.red('\nErrors:'));
        validation.errors.forEach(e => {
          console.log(chalk.red(`  ✗ ${e.field}: ${e.message}`));
        });
      } else {
        spinner?.succeed('Validation passed');
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        validation.warnings.forEach(w => {
          console.log(chalk.yellow(`  ⚠ ${w.field}: ${w.message}`));
        });

        if (options.strict) {
          process.exit(1);
        }
      }

      // Show manifest summary
      console.log(chalk.cyan('\nManifest Summary:'));
      console.log(`  Name: ${manifest.name}`);
      console.log(`  Version: ${manifest.version}`);
      console.log(`  Description: ${manifest.description}`);
      console.log(`  Transport: ${manifest.transport?.join(', ') || 'none'}`);
      console.log(`  Tools: ${manifest.tools?.length || 0}`);
      console.log(`  Resources: ${manifest.resources?.length || 0}`);
      console.log(`  Prompts: ${manifest.prompts?.length || 0}`);
    } catch (error) {
      if (spinner) {
        spinner.fail('Validation failed');
        console.error(chalk.red((error as Error).message));
      } else {
        console.log(JSON.stringify({ valid: false, error: (error as Error).message }));
      }
      process.exit(1);
    }
  });

// Subcommand: info
registryCommand
  .command('info')
  .description('Get information about a registry server')
  .argument('<name>', 'Server name in registry')
  .option('--registry <url>', 'Registry URL', 'https://registry.modelcontextprotocol.io')
  .option('--json', 'Output as JSON')
  .action(async (serverName: string, options: InfoOptions) => {
    const spinner = options.json ? null : ora(`Fetching ${serverName}...`).start();

    try {
      const info = await fetchServerInfo(serverName, { registryUrl: options.registry });

      if (!info) {
        if (spinner) {
          spinner.fail(`Server "${serverName}" not found`);
        } else {
          console.log(JSON.stringify({ found: false, name: serverName }));
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        spinner?.succeed(`Found "${serverName}"`);
        console.log(chalk.cyan('\nServer Info:'));
        console.log(`  Name: ${info.name}`);
        console.log(`  Display Name: ${info.displayName || info.name}`);
        console.log(`  Version: ${info.version}`);
        console.log(`  Description: ${info.description}`);
        console.log(`  Vendor: ${info.vendor || 'Unknown'}`);
        console.log(`  License: ${info.license || 'Unknown'}`);
        console.log(`  Transport: ${info.transport?.join(', ') || 'none'}`);

        if (info.tools && info.tools.length > 0) {
          console.log(chalk.cyan('\nTools:'));
          info.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
        }

        if (info.resources && info.resources.length > 0) {
          console.log(chalk.cyan('\nResources:'));
          info.resources.forEach(resource => {
            console.log(`  - ${resource.uri}: ${resource.description || resource.name}`);
          });
        }

        if (info.repository) {
          console.log(chalk.cyan(`\nRepository: ${info.repository}`));
        }
      }
    } catch (error) {
      if (spinner) {
        spinner.fail('Failed to fetch server info');
        console.error(chalk.red((error as Error).message));
      } else {
        console.log(JSON.stringify({ found: false, error: (error as Error).message }));
      }
      process.exit(1);
    }
  });

// Shorthand command for validate
export const registryValidateCommand = new Command('registry:validate')
  .description('Validate registry.json manifest (shorthand)')
  .argument('[path]', 'Path to MCP server project', '.')
  .option('--generate', 'Generate manifest from project if not found')
  .option('--save', 'Save generated manifest')
  .option('--strict', 'Treat warnings as errors')
  .option('--json', 'Output as JSON')
  .action(async (projectPath: string, options: ValidateOptions) => {
    // Delegate to main validate command
    const validateCmd = registryCommand.commands.find(c => c.name() === 'validate');
    if (validateCmd) {
      await validateCmd.parseAsync([projectPath, ...Object.entries(options)
        .filter(([, v]) => v)
        .map(([k]) => `--${k}`)], { from: 'user' });
    }
  });
