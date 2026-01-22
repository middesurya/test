import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { addTool } from '../utils/tool-generator';
import { validateToolName } from '../utils/validation';
import fs from 'fs/promises';
import path from 'path';

interface AddToolOptions {
  description?: string;
  inputs?: string;
}

/**
 * Safely parse JSON with error handling
 * Prevents DoS/crashes from malformed JSON input
 */
function safeJsonParse<T = object>(jsonString: string, context: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON in ${context}: ${message}`);
  }
}

export const addCommand = new Command('add')
  .description('Add components to an existing MCP server project');

addCommand
  .command('tool <tool-name>')
  .description('Add a new tool to the project')
  .option('-d, --description <desc>', 'Tool description')
  .option('-i, --inputs <schema>', 'Input schema (JSON)')
  .action(async (toolName: string, options: AddToolOptions) => {
    console.log(chalk.cyan('\n🔧 Adding new tool:'), chalk.bold(toolName), '\n');

    // Validate tool name
    const nameValidation = validateToolName(toolName);
    if (!nameValidation.valid) {
      console.error(chalk.red(`❌ Invalid tool name: ${nameValidation.error}`));
      console.error(chalk.dim('   Tool names must start with a letter and contain only lowercase letters, numbers, and hyphens'));
      process.exit(1);
    }

    // Pre-flight check: are we in a valid project?
    const projectCheck = await isValidProject(process.cwd());
    if (!projectCheck.valid) {
      console.error(chalk.red('❌ Not in an MCP project directory'));
      console.error(chalk.dim('   Run this command from your project root (where package.json or requirements.txt exists)'));
      console.error(chalk.dim('   Or create a new project first: mcp-gen create my-project'));
      process.exit(1);
    }

    // Parse inputs from CLI option (with error handling)
    let parsedInputs: object | null = null;
    if (options.inputs) {
      parsedInputs = safeParseJSON(options.inputs, 'inputs option');
      if (parsedInputs === null) {
        process.exit(1);
      }
    }

    let toolConfig = {
      name: toolName,
      description: options.description || '',
      inputs: options.inputs ? safeJsonParse(options.inputs, '--inputs option') : null
    };

    // Interactive mode if description not provided
    if (!options.description) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Tool description:',
          default: `A tool that ${toolName.replace(/-/g, ' ')}`
        },
        {
          type: 'editor',
          name: 'inputs',
          message: 'Define input schema (JSON):',
          default: JSON.stringify({
            type: 'object',
            properties: {
              input: { type: 'string', description: 'The input parameter' }
            },
            required: ['input']
          }, null, 2)
        }
      ]);

      // Parse schema from editor (with error handling)
      const schemaInputs = safeParseJSON(answers.inputs, 'input schema');
      if (schemaInputs === null) {
        process.exit(1);
      }

      toolConfig = {
        name: toolName,
        description: answers.description,
        inputs: safeJsonParse(answers.inputs, 'input schema editor')
      };
    }

    const spinner = ora('Adding tool...').start();

    try {
      await addTool(process.cwd(), toolConfig);
      spinner.succeed(chalk.green(`Tool '${toolName}' added successfully!`));

      // Show appropriate file paths based on language
      const fileExt = projectCheck.language === 'python' ? '.py' : '.ts';
      const snakeName = toolName.replace(/-/g, '_');
      const fileName = projectCheck.language === 'python' ? snakeName : toolName;

      console.log(chalk.cyan('\n📁 Files created:'));
      console.log(chalk.dim(`   src/tools/${fileName}${fileExt}`));
      if (projectCheck.language === 'python') {
        console.log(chalk.dim(`   tests/test_${snakeName}.py`));
      } else {
        console.log(chalk.dim(`   tests/tools/${toolName}.test.ts`));
      }

      console.log(chalk.yellow('\n✨ Don\'t forget to implement your tool logic!'));
      console.log(chalk.dim(`   Open src/tools/${fileName}${fileExt} to get started\n`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to add tool'));
      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));
      }
      process.exit(1);
    }
  });
