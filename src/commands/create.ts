import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { generateProject } from '../utils/generator';
import { validateProjectName } from '../utils/validation';

interface CreateOptions {
  template: string;
  typescript: boolean;
  python: boolean;
  docker: boolean;
  auth?: string;
  interactive: boolean;
  force: boolean;
}

interface ProjectConfig {
  name: string;
  description: string;
  author: string;
  template: string;
  language: 'typescript' | 'python';
  includeDocker: boolean;
  authType?: 'oauth' | 'apikey' | 'none';
}

/**
 * Check if a directory exists and is not empty
 */
async function directoryExists(dirPath: string): Promise<{ exists: boolean; isEmpty: boolean }> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return { exists: false, isEmpty: true };
    }
    const files = await fs.readdir(dirPath);
    return { exists: true, isEmpty: files.length === 0 };
  } catch {
    return { exists: false, isEmpty: true };
  }
}

/**
 * Check if we have write permissions
 */
async function canWrite(dirPath: string): Promise<boolean> {
  try {
    const testFile = path.join(dirPath, '.mcp-gen-test');
    await fs.writeFile(testFile, '');
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

export const createCommand = new Command('create')
  .description('Create a new MCP server project')
  .argument('<project-name>', 'Name of the project')
  .option('-t, --template <name>', 'Template to use (basic, discord-bot, api-wrapper)', 'basic')
  .option('--typescript', 'Use TypeScript (default)', true)
  .option('--python', 'Use Python instead of TypeScript')
  .option('--docker', 'Include Docker configuration')
  .option('--auth <type>', 'Include authentication (oauth, apikey)')
  .option('--no-interactive', 'Skip prompts, use defaults')
  .option('-f, --force', 'Overwrite existing directory')
  .action(async (projectName: string, options: CreateOptions) => {
    // Banner
    console.log(chalk.cyan('\n╔═══════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('   🚀 MCP Server Boilerplate Generator    ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚═══════════════════════════════════════════╝\n'));

    // Validate project name
    const validation = validateProjectName(projectName);
    if (!validation.valid) {
      console.error(chalk.red(`❌ Invalid project name: ${validation.error}`));
      console.error(chalk.dim('   Project names must be lowercase and can contain hyphens, underscores, and dots'));
      process.exit(1);
    }

    const projectPath = path.resolve(process.cwd(), projectName);

    // Pre-flight checks
    console.log(chalk.dim('Running pre-flight checks...\n'));

    // Check 1: Directory existence
    const dirCheck = await directoryExists(projectPath);
    if (dirCheck.exists && !dirCheck.isEmpty) {
      if (!options.force) {
        console.error(chalk.red(`❌ Directory '${projectName}' already exists and is not empty`));
        console.error(chalk.dim('   Use --force to overwrite, or choose a different name'));
        process.exit(1);
      }
      console.log(chalk.yellow(`⚠️  Directory exists, will overwrite (--force)`));
    }

    // Check 2: Write permissions
    const parentDir = path.dirname(projectPath);
    if (!(await canWrite(parentDir))) {
      console.error(chalk.red(`❌ No write permission in '${parentDir}'`));
      console.error(chalk.dim('   Check your permissions or choose a different location'));
      process.exit(1);
    }

    console.log(chalk.green('✓ Pre-flight checks passed\n'));

    let config: ProjectConfig;

    if (options.interactive) {
      // Interactive mode - prompt for configuration
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: chalk.cyan('Project description:'),
          default: 'An MCP server built with mcp-gen'
        },
        {
          type: 'input',
          name: 'author',
          message: chalk.cyan('Author:'),
          default: ''
        },
        {
          type: 'list',
          name: 'template',
          message: chalk.cyan('Select a template:'),
          choices: [
            { name: `${chalk.green('●')} Basic MCP Server     ${chalk.dim('- Simple starter template')}`, value: 'basic' },
            { name: `${chalk.blue('●')} Discord Bot          ${chalk.dim('- Discord.js integration')}`, value: 'discord-bot' },
            { name: `${chalk.yellow('●')} API Wrapper          ${chalk.dim('- HTTP client with caching')}`, value: 'api-wrapper' }
          ],
          default: options.template
        },
        {
          type: 'list',
          name: 'language',
          message: chalk.cyan('Select language:'),
          choices: [
            { name: `${chalk.blue('●')} TypeScript`, value: 'typescript' },
            { name: `${chalk.green('●')} Python`, value: 'python' }
          ],
          default: options.python ? 'python' : 'typescript'
        },
        {
          type: 'confirm',
          name: 'includeDocker',
          message: chalk.cyan('Include Docker configuration?'),
          default: options.docker || false
        },
        {
          type: 'list',
          name: 'authType',
          message: chalk.cyan('Authentication type:'),
          choices: [
            { name: 'None', value: 'none' },
            { name: 'OAuth 2.0', value: 'oauth' },
            { name: 'API Key', value: 'apikey' }
          ],
          default: options.auth || 'none'
        }
      ]);

      config = {
        name: projectName,
        ...answers
      };
    } else {
      // Non-interactive mode - use defaults and options
      config = {
        name: projectName,
        description: 'An MCP server built with mcp-gen',
        author: '',
        template: options.template,
        language: options.python ? 'python' : 'typescript',
        includeDocker: options.docker || false,
        authType: (options.auth as 'oauth' | 'apikey') || 'none'
      };
    }

    // Show configuration summary
    console.log(chalk.cyan('\n📋 Configuration:'));
    console.log(chalk.dim(`   Template:  ${config.template}`));
    console.log(chalk.dim(`   Language:  ${config.language}`));
    console.log(chalk.dim(`   Docker:    ${config.includeDocker ? 'Yes' : 'No'}`));
    console.log(chalk.dim(`   Auth:      ${config.authType || 'None'}`));

    // Generate project
    const spinner = ora({
      text: 'Generating project...',
      spinner: 'dots'
    }).start();

    try {
      await generateProject(projectPath, config);
      spinner.succeed(chalk.green('Project generated successfully!'));

      // Success message with next steps
      console.log(chalk.cyan('\n╔═══════════════════════════════════════════╗'));
      console.log(chalk.cyan('║') + chalk.bold.white('             🎉 All Done!                  ') + chalk.cyan('║'));
      console.log(chalk.cyan('╚═══════════════════════════════════════════╝'));

      console.log(chalk.white('\n📁 Project created at:'), chalk.bold(projectPath));

      console.log(chalk.cyan('\n📋 Next steps:\n'));

      const isTypeScript = config.language === 'typescript';
      const commands = isTypeScript
        ? ['npm install', 'npm run dev']
        : ['pip install -r requirements.txt', 'python -m src.main'];

      console.log(chalk.white(`   ${chalk.dim('1.')} cd ${projectName}`));
      console.log(chalk.white(`   ${chalk.dim('2.')} ${commands[0]}`));
      console.log(chalk.white(`   ${chalk.dim('3.')} ${commands[1]}`));

      if (config.template === 'discord-bot') {
        console.log(chalk.yellow('\n   ⚠️  Don\'t forget to add your DISCORD_TOKEN to .env!'));
      } else if (config.template === 'api-wrapper') {
        console.log(chalk.yellow('\n   Configure your API_BASE_URL and API_KEY in .env'));
      }

      console.log(chalk.cyan('\n   Add new tools with: ') + chalk.white('mcp-gen add tool <name>'));

      console.log(chalk.green('\n✨ Happy coding!\n'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate project'));
      if (error instanceof Error) {
        console.error(chalk.red(`\n   ${error.message}`));
      }
      process.exit(1);
    }
  });
