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

  // Generate CI/CD workflows
  await generateCICD(projectPath, config);
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

async function generateCICD(projectPath: string, config: ProjectConfig): Promise<void> {
  const workflowsDir = path.join(projectPath, '.github', 'workflows');
  await fs.mkdir(workflowsDir, { recursive: true });

  if (config.language === 'typescript') {
    // TypeScript CI workflow
    const ciWorkflow = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

  type-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit
`;

    await fs.writeFile(path.join(workflowsDir, 'ci.yml'), ciWorkflow, 'utf-8');

    // Release workflow
    const releaseWorkflow = `name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;

    await fs.writeFile(path.join(workflowsDir, 'release.yml'), releaseWorkflow, 'utf-8');

  } else {
    // Python CI workflow
    const ciWorkflow = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Run linter
        run: |
          pip install flake8
          flake8 src tests --max-line-length=120

      - name: Run tests
        run: pytest

  type-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install mypy

      - name: Type check
        run: mypy src --ignore-missing-imports
`;

    await fs.writeFile(path.join(workflowsDir, 'ci.yml'), ciWorkflow, 'utf-8');

    // Release workflow for Python
    const releaseWorkflow = `name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install build tools
        run: |
          python -m pip install --upgrade pip
          pip install build twine

      - name: Build package
        run: python -m build

      - name: Publish to PyPI
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: \${{ secrets.PYPI_TOKEN }}
        run: twine upload dist/*
`;

    await fs.writeFile(path.join(workflowsDir, 'release.yml'), releaseWorkflow, 'utf-8');
  }
}
