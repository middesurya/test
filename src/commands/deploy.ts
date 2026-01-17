import { Command } from 'commander';
import path from 'path';
import { generateDeploymentConfig, getDeploymentTargets, DeploymentTarget } from '../utils/deploy-generator';

export const deployCommand = new Command('deploy')
  .description('Generate deployment configurations for MCP servers')
  .option('-t, --target <target>', 'Deployment target (docker, lambda, vercel, kubernetes)', 'docker')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-m, --memory <memory>', 'Memory limit in MB', '512')
  .option('-r, --replicas <replicas>', 'Kubernetes replicas', '3')
  .option('--region <region>', 'AWS region for Lambda', 'us-east-1')
  .option('--list', 'List available deployment targets')
  .option('--dir <directory>', 'Project directory', '.')
  .action(async (options) => {
    try {
      // List targets if requested
      if (options.list) {
        console.log('\nAvailable deployment targets:\n');
        const targets = getDeploymentTargets();
        for (const t of targets) {
          console.log(`  ${t.target.padEnd(12)} - ${t.description}`);
        }
        console.log('\nUsage: mcp-gen deploy --target <target>\n');
        return;
      }

      const validTargets: DeploymentTarget[] = ['docker', 'lambda', 'vercel', 'kubernetes'];
      if (!validTargets.includes(options.target as DeploymentTarget)) {
        console.error(`Invalid target: ${options.target}`);
        console.error(`Valid targets: ${validTargets.join(', ')}`);
        process.exit(1);
      }

      const projectPath = path.resolve(options.dir);
      const projectName = path.basename(projectPath);

      console.log(`\nGenerating ${options.target} deployment config for ${projectName}...\n`);

      const result = await generateDeploymentConfig(projectPath, {
        projectName,
        target: options.target as DeploymentTarget,
        port: parseInt(options.port, 10),
        memory: parseInt(options.memory, 10),
        replicas: parseInt(options.replicas, 10),
        region: options.region
      });

      console.log('Generated files:');
      for (const file of result.files) {
        console.log(`  ✓ ${file.path}`);
      }

      console.log('\nNext steps:\n');
      for (const cmd of result.commands) {
        if (cmd.startsWith('#')) {
          console.log(`\n${cmd}`);
        } else if (cmd) {
          console.log(`  ${cmd}`);
        }
      }

      console.log('\n');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
