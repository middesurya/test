#!/usr/bin/env node
import { Command } from 'commander';
import { createCommand } from './commands/create';
import { addCommand } from './commands/add';
import { templatesCommand } from './commands/templates';
import { deployCommand } from './commands/deploy';
import { docsCommand } from './commands/docs';
import { publishCommand } from './commands/publish';
import { registryCommand, registryValidateCommand } from './commands/registry';
import { testCommand, testMockCommand, testChaosCommand, testCompatCommand } from './commands/test-advanced';
import { secretsCommand, secretsInitCommand, secretsRotateCommand } from './commands/secrets';
import { inspectCommand, debugCommand } from './commands/inspect';

const program = new Command();

program
  .name('mcp-gen')
  .description('MCP Server Boilerplate Generator - Quickly scaffold MCP servers')
  .version('0.1.0');

program.addCommand(createCommand);
program.addCommand(addCommand);
program.addCommand(templatesCommand);
program.addCommand(deployCommand);
program.addCommand(docsCommand);
program.addCommand(publishCommand);
program.addCommand(registryCommand);
program.addCommand(registryValidateCommand);
program.addCommand(testCommand);
program.addCommand(testMockCommand);
program.addCommand(testChaosCommand);
program.addCommand(testCompatCommand);
program.addCommand(secretsCommand);
program.addCommand(secretsInitCommand);
program.addCommand(secretsRotateCommand);
program.addCommand(inspectCommand);
program.addCommand(debugCommand);

program.parse();
