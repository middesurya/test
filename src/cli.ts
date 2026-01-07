#!/usr/bin/env node
import { Command } from 'commander';
import { createCommand } from './commands/create';
import { addCommand } from './commands/add';
import { templatesCommand } from './commands/templates';

const program = new Command();

program
  .name('mcp-gen')
  .description('MCP Server Boilerplate Generator - Quickly scaffold MCP servers')
  .version('0.1.0');

program.addCommand(createCommand);
program.addCommand(addCommand);
program.addCommand(templatesCommand);

program.parse();
