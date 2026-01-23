/**
 * Publish Command
 * Publish MCP server to the official registry
 */

import { Command } from 'commander';
import ora from 'ora';
import path from 'path';
import chalk from 'chalk';
import {
  validateManifest,
  generateManifest,
  publishToRegistry,
  saveManifest,
  loadManifest
} from '../utils/registry-client';

interface PublishOptions {
  dryRun?: boolean;
  registry?: string;
  token?: string;
  force?: boolean;
  generate?: boolean;
  save?: boolean;
}

export const publishCommand = new Command('publish')
  .description('Publish MCP server to registry')
  .argument('[path]', 'Path to MCP server project', '.')
  .option('--dry-run', 'Validate without publishing')
  .option('--registry <url>', 'Registry URL', 'https://registry.modelcontextprotocol.io')
  .option('--token <token>', 'Registry API token (or use MCP_REGISTRY_TOKEN env var)')
  .option('--force', 'Override validation warnings')
  .option('--generate', 'Generate manifest from project files')
  .option('--save', 'Save generated manifest to registry.json')
  .action(async (projectPath: string, options: PublishOptions) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora('Loading manifest...').start();

    try {
      // Load or generate manifest
      let manifest = await loadManifest(resolvedPath);

      if (!manifest && !options.generate) {
        spinner.fail('No registry.json found');
        console.log(chalk.yellow('\nUse --generate to create a manifest from project files'));
        console.log('Or create registry.json manually with the following structure:');
        console.log(chalk.gray(`
{
  "name": "my-mcp-server",
  "description": "Description of your server",
  "version": "1.0.0",
  "transport": ["stdio"],
  "tools": [
    { "name": "myTool", "description": "What the tool does" }
  ]
}
`));
        process.exit(1);
      }

      if (!manifest || options.generate) {
        spinner.text = 'Generating manifest from project...';
        manifest = await generateManifest(resolvedPath);
      }

      // Save if requested
      if (options.save) {
        spinner.text = 'Saving manifest...';
        await saveManifest(manifest, resolvedPath);
        console.log(chalk.green('\n  ✓ Saved to registry.json'));
      }

      // Validate
      spinner.text = 'Validating manifest...';
      const validation = validateManifest(manifest);

      if (!validation.valid) {
        spinner.fail('Validation failed');
        console.log(chalk.red('\nErrors:'));
        validation.errors.forEach(e => {
          console.log(chalk.red(`  ✗ ${e.field}: ${e.message}`));
        });
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        validation.warnings.forEach(w => {
          console.log(chalk.yellow(`  ⚠ ${w.field}: ${w.message}`));
        });
      }

      // Show manifest preview
      console.log(chalk.cyan('\nManifest:'));
      console.log(chalk.gray(JSON.stringify(manifest, null, 2)));

      // Publish
      if (options.dryRun) {
        spinner.succeed('Validation passed (dry run)');
        return;
      }

      spinner.text = 'Publishing to registry...';
      const token = options.token || process.env.MCP_REGISTRY_TOKEN;

      const result = await publishToRegistry(manifest, {
        dryRun: false,
        registryUrl: options.registry,
        token,
        force: options.force
      });

      if (result.success) {
        spinner.succeed('Published successfully!');
        if (result.url) {
          console.log(chalk.green(`\n  URL: ${result.url}`));
        }
      } else {
        spinner.fail('Publish failed');
        console.log(chalk.red(`\n  ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to publish');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });
