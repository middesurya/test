/**
 * MCP Inspector Integration Command
 * Launch MCP Inspector for debugging servers
 */

import { Command } from 'commander';
import ora from 'ora';
import path from 'path';
import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

interface InspectOptions {
  command?: string;
  env?: string[];
  port?: string;
  open?: boolean;
}

export const inspectCommand = new Command('inspect')
  .description('Launch MCP Inspector for debugging')
  .argument('[path]', 'Path to MCP server project', '.')
  .option('-c, --command <cmd>', 'Custom command to run the server')
  .option('-e, --env <vars...>', 'Environment variables (KEY=VALUE)')
  .option('-p, --port <port>', 'Inspector port', '5173')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (projectPath: string, options: InspectOptions) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora('Starting MCP Inspector...').start();

    try {
      // Detect server entry point
      let serverCommand = options.command;
      if (!serverCommand) {
        serverCommand = await detectServerCommand(resolvedPath);
      }

      spinner.text = 'Checking for @modelcontextprotocol/inspector...';

      // Check if inspector is installed
      const hasInspector = await checkInspectorInstalled();
      if (!hasInspector) {
        spinner.text = 'Installing @modelcontextprotocol/inspector...';
        await installInspector();
      }

      spinner.succeed('MCP Inspector ready');
      console.log(chalk.cyan('\nStarting inspector with:'));
      console.log(`  Server: ${serverCommand}`);
      console.log(`  Port: ${options.port}`);

      // Build environment
      const env = { ...process.env };
      if (options.env) {
        for (const e of options.env) {
          const [key, ...valueParts] = e.split('=');
          env[key] = valueParts.join('=');
        }
      }

      // Launch inspector
      console.log(chalk.cyan('\n🔍 Launching MCP Inspector...'));
      console.log(chalk.gray(`   Open: http://localhost:${options.port}\n`));

      const inspectorProcess = spawn(
        'npx',
        ['@modelcontextprotocol/inspector', serverCommand],
        {
          cwd: resolvedPath,
          env: {
            ...env,
            PORT: options.port,
          },
          stdio: 'inherit',
          shell: true,
        }
      );

      // Handle process events
      inspectorProcess.on('error', (error) => {
        console.error(chalk.red('Failed to start inspector:'), error.message);
        process.exit(1);
      });

      inspectorProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(chalk.red(`Inspector exited with code ${code}`));
          process.exit(code);
        }
      });

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nShutting down inspector...'));
        inspectorProcess.kill('SIGINT');
      });

      process.on('SIGTERM', () => {
        inspectorProcess.kill('SIGTERM');
      });
    } catch (error) {
      spinner.fail('Failed to start inspector');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * Detect the server command based on project structure
 */
async function detectServerCommand(projectPath: string): Promise<string> {
  // Check for common entry points
  const candidates = [
    { file: 'dist/index.js', cmd: 'node dist/index.js' },
    { file: 'build/index.js', cmd: 'node build/index.js' },
    { file: 'src/index.ts', cmd: 'npx ts-node src/index.ts' },
    { file: 'index.ts', cmd: 'npx ts-node index.ts' },
    { file: 'main.py', cmd: 'python main.py' },
    { file: 'src/main.py', cmd: 'python src/main.py' },
  ];

  for (const { file, cmd } of candidates) {
    try {
      await fs.access(path.join(projectPath, file));
      return cmd;
    } catch {
      // File doesn't exist, try next
    }
  }

  // Check package.json for scripts
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    if (packageJson.scripts?.start) {
      return 'npm start';
    }
    if (packageJson.scripts?.dev) {
      return 'npm run dev';
    }
  } catch {
    // No package.json
  }

  throw new Error(
    'Could not detect server command. Use --command to specify how to run your server.'
  );
}

/**
 * Check if MCP Inspector is installed
 */
async function checkInspectorInstalled(): Promise<boolean> {
  try {
    const { execSync } = require('child_process');
    execSync('npx @modelcontextprotocol/inspector --version', {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install MCP Inspector globally
 */
async function installInspector(): Promise<void> {
  const { execSync } = require('child_process');
  execSync('npm install -g @modelcontextprotocol/inspector', {
    stdio: 'inherit',
  });
}

// Debug subcommand for specific tool debugging
export const debugCommand = new Command('debug')
  .description('Debug a specific MCP tool')
  .argument('<tool>', 'Tool name to debug')
  .argument('[path]', 'Path to MCP server project', '.')
  .option('-i, --input <json>', 'Tool input as JSON')
  .option('-f, --file <path>', 'Tool input from file')
  .action(async (toolName: string, projectPath: string, options: { input?: string; file?: string }) => {
    const resolvedPath = path.resolve(process.cwd(), projectPath);
    const spinner = ora(`Debugging tool: ${toolName}`).start();

    try {
      // Get input
      let input: unknown = {};
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        input = JSON.parse(content);
      } else if (options.input) {
        input = JSON.parse(options.input);
      }

      spinner.text = `Calling ${toolName} with input...`;

      // This would connect to the running server
      // For now, just show what would be called
      spinner.succeed(`Debug setup for ${toolName}`);
      console.log(chalk.cyan('\nDebug Configuration:'));
      console.log(`  Tool: ${toolName}`);
      console.log(`  Input: ${JSON.stringify(input, null, 2)}`);
      console.log(chalk.yellow('\nTo debug, run:'));
      console.log(`  mcp-gen inspect ${projectPath}`);
      console.log(`  Then call the "${toolName}" tool from the inspector UI`);
    } catch (error) {
      spinner.fail('Debug setup failed');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });
