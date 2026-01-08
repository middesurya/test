/**
 * Deployment Configuration Generator
 * Generates deployment configs for Docker, AWS Lambda, Vercel, and Kubernetes
 */

import fs from 'fs/promises';
import path from 'path';

export type DeploymentTarget = 'docker' | 'lambda' | 'vercel' | 'kubernetes';

interface DeploymentConfig {
  projectName: string;
  target: DeploymentTarget;
  port?: number;
  memory?: number;
  replicas?: number;
  region?: string;
  includeMonitoring?: boolean;
}

interface DeploymentResult {
  files: { path: string; content: string }[];
  commands: string[];
}

/**
 * Generate deployment configuration files for the specified target
 */
export async function generateDeploymentConfig(
  projectPath: string,
  config: DeploymentConfig
): Promise<DeploymentResult> {
  const generators: Record<DeploymentTarget, () => DeploymentResult> = {
    docker: () => generateDockerConfig(config),
    lambda: () => generateLambdaConfig(config),
    vercel: () => generateVercelConfig(config),
    kubernetes: () => generateKubernetesConfig(config)
  };

  const result = generators[config.target]();

  // Write generated files
  for (const file of result.files) {
    const filePath = path.join(projectPath, file.path);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.content, 'utf-8');
  }

  return result;
}

function generateDockerConfig(config: DeploymentConfig): DeploymentResult {
  const port = config.port || 3000;
  const memory = config.memory || 512;

  const dockerfile = `# Multi-stage Docker build for ${config.projectName}
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 mcp

# Copy built application
COPY --from=builder --chown=mcp:nodejs /app/dist ./dist
COPY --from=builder --chown=mcp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mcp:nodejs /app/package.json ./
COPY --from=builder --chown=mcp:nodejs /app/mcp-spec.json ./

USER mcp
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/health || exit 1

ENV NODE_ENV=production
ENV PORT=${port}

CMD ["node", "dist/index.js"]
`;

  const dockerCompose = `version: '3.8'

services:
  ${config.projectName}:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      - NODE_ENV=production
      - PORT=${port}
      - LOG_LEVEL=info
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:${port}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: ${memory}M
          cpus: '0.5'
        reservations:
          memory: ${Math.floor(memory / 2)}M
          cpus: '0.25'
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
`;

  const dockerIgnore = `node_modules
npm-debug.log
.git
.gitignore
.env
.env.local
.env.*.local
*.md
!README.md
coverage
.nyc_output
tests
*.test.ts
*.spec.ts
.vscode
.idea
dist
*.log
`;

  return {
    files: [
      { path: 'Dockerfile', content: dockerfile },
      { path: 'docker-compose.yml', content: dockerCompose },
      { path: '.dockerignore', content: dockerIgnore }
    ],
    commands: [
      '# Build the Docker image',
      `docker build -t ${config.projectName} .`,
      '',
      '# Run with Docker Compose',
      'docker-compose up -d',
      '',
      '# View logs',
      'docker-compose logs -f',
      '',
      '# Stop the container',
      'docker-compose down'
    ]
  };
}

function generateLambdaConfig(config: DeploymentConfig): DeploymentResult {
  const memory = config.memory || 512;
  const region = config.region || 'us-east-1';

  const serverlessYml = `service: ${config.projectName}

provider:
  name: aws
  runtime: nodejs20.x
  region: ${region}
  memorySize: ${memory}
  timeout: 30
  environment:
    NODE_ENV: production
    LOG_LEVEL: info
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
          Resource: "*"

functions:
  mcp:
    handler: dist/lambda.handler
    events:
      - http:
          path: /mcp
          method: post
          cors:
            origin: '*'
            headers:
              - Content-Type
              - Authorization
            allowCredentials: false
      - http:
          path: /mcp
          method: options
          cors: true
      - http:
          path: /.well-known/mcp-configuration
          method: get
          cors: true
      - http:
          path: /health
          method: get

plugins:
  - serverless-offline

custom:
  serverless-offline:
    httpPort: 3000
    lambdaPort: 3002

package:
  patterns:
    - '!src/**'
    - '!tests/**'
    - '!*.md'
    - '!.env*'
    - 'dist/**'
    - 'mcp-spec.json'
`;

  const lambdaHandler = `/**
 * AWS Lambda Handler for MCP Server
 * Implements Streamable HTTP transport (MCP 2025-03-26)
 */
import { handler as mcpHandler } from './index';

export { mcpHandler as handler };
`;

  return {
    files: [
      { path: 'serverless.yml', content: serverlessYml },
      { path: 'src/lambda.ts', content: lambdaHandler }
    ],
    commands: [
      '# Install Serverless Framework',
      'npm install -g serverless',
      'npm install --save-dev serverless-offline',
      '',
      '# Test locally',
      'npx serverless offline',
      '',
      '# Deploy to AWS',
      'npx serverless deploy',
      '',
      '# View logs',
      'npx serverless logs -f mcp -t',
      '',
      '# Remove deployment',
      'npx serverless remove'
    ]
  };
}

function generateVercelConfig(config: DeploymentConfig): DeploymentResult {
  const vercelJson = `{
  "version": 2,
  "name": "${config.projectName}",
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/mcp",
      "dest": "/dist/index.js",
      "methods": ["POST", "OPTIONS"]
    },
    {
      "src": "/.well-known/mcp-configuration",
      "dest": "/dist/index.js",
      "methods": ["GET"]
    },
    {
      "src": "/health",
      "dest": "/dist/index.js",
      "methods": ["GET"]
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" }
      ]
    }
  ]
}
`;

  const vercelIgnore = `node_modules
src
tests
*.md
!README.md
.env
.env.*
coverage
.git
`;

  return {
    files: [
      { path: 'vercel.json', content: vercelJson },
      { path: '.vercelignore', content: vercelIgnore }
    ],
    commands: [
      '# Install Vercel CLI',
      'npm install -g vercel',
      '',
      '# Build the project',
      'npm run build',
      '',
      '# Deploy to preview',
      'vercel',
      '',
      '# Deploy to production',
      'vercel --prod',
      '',
      '# View deployment logs',
      'vercel logs'
    ]
  };
}

function generateKubernetesConfig(config: DeploymentConfig): DeploymentResult {
  const port = config.port || 3000;
  const memory = config.memory || 512;
  const replicas = config.replicas || 3;

  const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.projectName}
  labels:
    app: ${config.projectName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${config.projectName}
  template:
    metadata:
      labels:
        app: ${config.projectName}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "${port}"
        prometheus.io/path: "/metrics"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: ${config.projectName}
        image: ${config.projectName}:latest
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: ${port}
          protocol: TCP
        resources:
          requests:
            memory: "${Math.floor(memory / 2)}Mi"
            cpu: "250m"
          limits:
            memory: "${memory}Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: ${port}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: ${port}
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "${port}"
        envFrom:
        - secretRef:
            name: ${config.projectName}-secrets
        - configMapRef:
            name: ${config.projectName}-config
`;

  const service = `apiVersion: v1
kind: Service
metadata:
  name: ${config.projectName}
  labels:
    app: ${config.projectName}
spec:
  type: ClusterIP
  ports:
  - port: ${port}
    targetPort: ${port}
    protocol: TCP
    name: http
  selector:
    app: ${config.projectName}
`;

  const hpa = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${config.projectName}-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${config.projectName}
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
`;

  const configMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${config.projectName}-config
data:
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
`;

  const secretsExample = `# Example secrets (do not commit actual secrets!)
apiVersion: v1
kind: Secret
metadata:
  name: ${config.projectName}-secrets
type: Opaque
stringData:
  API_KEY: "your-api-key-here"
  OAUTH_CLIENT_SECRET: "your-oauth-secret-here"
`;

  const ingress = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${config.projectName}-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Content-Type, Authorization"
spec:
  rules:
  - host: ${config.projectName}.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${config.projectName}
            port:
              number: ${port}
`;

  const kustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml
  - configmap.yaml
  - ingress.yaml

commonLabels:
  app.kubernetes.io/name: ${config.projectName}
  app.kubernetes.io/component: mcp-server
`;

  return {
    files: [
      { path: 'k8s/deployment.yaml', content: deployment },
      { path: 'k8s/service.yaml', content: service },
      { path: 'k8s/hpa.yaml', content: hpa },
      { path: 'k8s/configmap.yaml', content: configMap },
      { path: 'k8s/secrets.example.yaml', content: secretsExample },
      { path: 'k8s/ingress.yaml', content: ingress },
      { path: 'k8s/kustomization.yaml', content: kustomization }
    ],
    commands: [
      '# Build and push Docker image',
      `docker build -t ${config.projectName}:latest .`,
      `docker tag ${config.projectName}:latest your-registry/${config.projectName}:latest`,
      `docker push your-registry/${config.projectName}:latest`,
      '',
      '# Create secrets (edit secrets.example.yaml first)',
      `kubectl create secret generic ${config.projectName}-secrets --from-env-file=.env`,
      '',
      '# Apply configuration',
      'kubectl apply -k k8s/',
      '',
      '# Check deployment status',
      `kubectl get pods -l app=${config.projectName}`,
      `kubectl rollout status deployment/${config.projectName}`,
      '',
      '# View logs',
      `kubectl logs -l app=${config.projectName} -f`,
      '',
      '# Scale deployment',
      `kubectl scale deployment ${config.projectName} --replicas=5`
    ]
  };
}

/**
 * Get available deployment targets
 */
export function getDeploymentTargets(): { target: DeploymentTarget; description: string }[] {
  return [
    { target: 'docker', description: 'Docker with multi-stage build and Docker Compose' },
    { target: 'lambda', description: 'AWS Lambda with Serverless Framework' },
    { target: 'vercel', description: 'Vercel Edge Functions' },
    { target: 'kubernetes', description: 'Kubernetes with HPA and monitoring' }
  ];
}
