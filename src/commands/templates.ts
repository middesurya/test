import { Command } from 'commander';
import { getAvailableTemplates } from '../utils/template-loader';

export const templatesCommand = new Command('templates')
  .description('List available project templates')
  .action(async () => {
    console.log('\n📋 Available Templates\n');

    const templates = await getAvailableTemplates();

    templates.forEach(template => {
      console.log(`  ${template.name}`);
      console.log(`    ${template.description}`);
      console.log(`    Features: ${template.features.join(', ')}`);
      console.log();
    });

    console.log('Use: mcp-gen create <project-name> --template <template-name>\n');
  });
