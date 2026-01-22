import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { addTool } from '../utils/tool-generator';

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
    console.log('\n🔧 Adding new tool:', toolName, '\n');

    let toolConfig = {
      name: toolName,
      description: options.description || '',
      inputs: options.inputs ? safeJsonParse(options.inputs, '--inputs option') : null
    };

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

      toolConfig = {
        name: toolName,
        description: answers.description,
        inputs: safeJsonParse(answers.inputs, 'input schema editor')
      };
    }

    const spinner = ora('Adding tool...').start();

    try {
      await addTool(process.cwd(), toolConfig);
      spinner.succeed(`Tool '${toolName}' added successfully!`);

      console.log('\n📁 Files created:');
      console.log(`   src/tools/${toolName}.ts`);
      console.log(`   tests/tools/${toolName}.test.ts`);
      console.log('\n✨ Don\'t forget to implement your tool logic!\n');
    } catch (error) {
      spinner.fail('Failed to add tool');
      console.error(error);
      process.exit(1);
    }
  });
