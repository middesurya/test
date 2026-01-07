import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import { generateProject } from '../utils/generator';
import { validateProjectName } from '../utils/validation';

interface CreateOptions {
  template: string;
  typescript: boolean;
  python: boolean;
  docker: boolean;
  auth?: string;
  interactive: boolean;
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

export const createCommand = new Command('create')
  .description('Create a new MCP server project')
  .argument('<project-name>', 'Name of the project')
  .option('-t, --template <name>', 'Template to use (basic, discord, api)', 'basic')
  .option('--typescript', 'Use TypeScript (default)', true)
  .option('--python', 'Use Python instead of TypeScript')
  .option('--docker', 'Include Docker configuration')
  .option('--auth <type>', 'Include authentication (oauth, apikey)')
  .option('--no-interactive', 'Skip prompts, use defaults')
  .action(async (projectName: string, options: CreateOptions) => {
    console.log('\n🚀 MCP Server Boilerplate Generator\n');

    // Validate project name
    const validation = validateProjectName(projectName);
    if (!validation.valid) {
      console.error(`❌ Invalid project name: ${validation.error}`);
      process.exit(1);
    }

    let config: ProjectConfig;

    if (options.interactive) {
      // Interactive mode - prompt for configuration
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Project description:',
          default: 'An MCP server built with mcp-gen'
        },
        {
          type: 'input',
          name: 'author',
          message: 'Author:',
          default: ''
        },
        {
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: [
            { name: 'Basic MCP Server', value: 'basic' },
            { name: 'Discord Bot Integration', value: 'discord-bot' },
            { name: 'API Wrapper', value: 'api-wrapper' }
          ],
          default: options.template
        },
        {
          type: 'list',
          name: 'language',
          message: 'Select language:',
          choices: [
            { name: 'TypeScript', value: 'typescript' },
            { name: 'Python', value: 'python' }
          ],
          default: options.python ? 'python' : 'typescript'
        },
        {
          type: 'confirm',
          name: 'includeDocker',
          message: 'Include Docker configuration?',
          default: options.docker || false
        },
        {
          type: 'list',
          name: 'authType',
          message: 'Authentication type:',
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

    // Generate project
    const spinner = ora('Generating project...').start();

    try {
      const projectPath = path.resolve(process.cwd(), projectName);
      await generateProject(projectPath, config);
      spinner.succeed('Project generated successfully!');

      console.log('\n📁 Project created at:', projectPath);
      console.log('\n📋 Next steps:');
      console.log(`   cd ${projectName}`);
      console.log('   npm install');
      console.log('   npm run dev');
      console.log('\n✨ Happy coding!\n');
    } catch (error) {
      spinner.fail('Failed to generate project');
      console.error(error);
      process.exit(1);
    }
  });
