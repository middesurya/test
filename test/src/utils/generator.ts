import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import { loadTemplate } from './template-loader';

interface ProjectConfig {
  name: string;
  description: string;
  author: string;
  template: string;
  language: 'typescript' | 'python';
  includeDocker: boolean;
  authType?: 'oauth' | 'apikey' | 'none';
}

export async function generateProject(projectPath: string, config: ProjectConfig): Promise<void> {
  // Create project directory
  await fs.mkdir(projectPath, { recursive: true });

  // Load template
  const template = await loadTemplate(config.template, config.language);

  // Process and write each file
  for (const file of template.files) {
    const filePath = path.join(projectPath, file.path);
    const fileDir = path.dirname(filePath);

    // Create directory if needed
    await fs.mkdir(fileDir, { recursive: true });

    // Compile template with Handlebars
    const compiledTemplate = Handlebars.compile(file.content);
    const content = compiledTemplate({
      projectName: config.name,
      projectDescription: config.description,
      author: config.author,
      includeDocker: config.includeDocker,
      authType: config.authType,
      hasAuth: config.authType && config.authType !== 'none'
    });

    await fs.writeFile(filePath, content, 'utf-8');
  }

  // Generate MCP spec
  await generateMCPSpec(projectPath, config);

  // Generate Docker files if requested
  if (config.includeDocker) {
    await generateDockerFiles(projectPath, config);
  }
}

async function generateMCPSpec(projectPath: string, config: ProjectConfig): Promise<void> {
  const spec = {
    name: config.name,
    version: '1.0.0',
    description: config.description,
    tools: [
      {
        name: 'example-tool',
        description: 'An example tool to get you started',
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'The input to process'
            }
          },
          required: ['input']
        }
      }
    ],
    permissions: []
  };

  const specPath = path.join(projectPath, 'mcp-spec.json');
  await fs.writeFile(specPath, JSON.stringify(spec, null, 2), 'utf-8');
}

async function generateDockerFiles(projectPath: string, config: ProjectConfig): Promise<void> {
  const dockerfile = config.language === 'typescript'
    ? `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY mcp-spec.json ./

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
`
    : `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY mcp-spec.json ./

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "src.main"]
`;

  const dockerCompose = `version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
`;

  await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile, 'utf-8');
  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dockerCompose, 'utf-8');
}
