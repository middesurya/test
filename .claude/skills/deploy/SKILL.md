---
name: deploy
description: Deploy MCP servers to Docker, serverless platforms (AWS Lambda, Vercel), and Kubernetes. Use this for generating deployment configurations.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# MCP Deployment Skill

## Purpose

Generate deployment configurations and guide deployments for MCP servers across multiple platforms including Docker, serverless (AWS Lambda, Vercel), and Kubernetes.

## Quick Start

### CLI Usage

```bash
# Generate Docker deployment files
mcp-gen deploy --target docker

# Generate AWS Lambda (Serverless) config
mcp-gen deploy --target lambda --region us-east-1

# Generate Vercel deployment
mcp-gen deploy --target vercel

# Generate Kubernetes manifests
mcp-gen deploy --target kubernetes --replicas 3

# All targets with custom options
mcp-gen deploy --target docker --port 8080 --memory 1024
```

### Programmatic Usage

```typescript
import { generateDeploymentConfig } from './src/utils/deploy-generator';

// Generate Docker config
const result = await generateDeploymentConfig('./my-mcp-server', {
  projectName: 'my-mcp-server',
  target: 'docker',
  port: 3000,
  memory: 512
});

console.log('Generated files:', result.files.map(f => f.path));
console.log('Run commands:', result.commands);
```

## Utility Reference

**File**: `src/utils/deploy-generator.ts`

**Functions**:
- `generateDeploymentConfig(projectPath, config)` - Main generator
- `getDeploymentTargets()` - List available targets

**Config Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectName` | string | required | Project name |
| `target` | string | required | docker/lambda/vercel/kubernetes |
| `port` | number | 3000 | Server port |
| `memory` | number | 512 | Memory limit (MB) |
| `replicas` | number | 3 | K8s replicas |
| `region` | string | us-east-1 | AWS region |

## Supported Deployment Targets

### 1. Docker Deployment

**Generated Files:**

```dockerfile
# Dockerfile (multi-stage build)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcp
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER mcp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

**Commands:**
```bash
# Build image
docker build -t mcp-server .

# Run container
docker-compose up -d

# View logs
docker-compose logs -f
```

### 2. AWS Lambda (Streamable HTTP)

**Prerequisites:**
- Streamable HTTP transport (2025 spec)
- Stateless design
- <15 minute execution time

**Generated Files:**

```yaml
# serverless.yml
service: mcp-server

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  memorySize: 512
  timeout: 30
  environment:
    NODE_ENV: production

functions:
  mcp:
    handler: dist/lambda.handler
    events:
      - http:
          path: /mcp
          method: ANY
          cors: true
      - http:
          path: /.well-known/mcp-configuration
          method: GET

plugins:
  - serverless-offline
```

```typescript
// src/lambda.ts
import { createStreamableHandler } from './transport/streamable-http';
import { server } from './server';

export const handler = createStreamableHandler(server);
```

**Commands:**
```bash
# Deploy
npx serverless deploy

# Test locally
npx serverless offline

# View logs
npx serverless logs -f mcp
```

### 3. Vercel Edge Functions

**Generated Files:**

```json
// vercel.json
{
  "functions": {
    "api/mcp.ts": {
      "runtime": "edge"
    }
  },
  "routes": [
    {
      "src": "/mcp(.*)",
      "dest": "/api/mcp"
    },
    {
      "src": "/.well-known/mcp-configuration",
      "dest": "/api/well-known"
    }
  ]
}
```

```typescript
// api/mcp.ts
import { createEdgeHandler } from '../src/transport/edge';

export const config = { runtime: 'edge' };
export default createEdgeHandler();
```

**Commands:**
```bash
# Deploy
vercel deploy --prod

# Preview
vercel
```

### 4. Kubernetes

**Generated Files:**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp-server
        image: mcp-server:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: mcp-secrets
```

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-server
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
```

**Commands:**
```bash
# Apply configuration
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=mcp-server

# View logs
kubectl logs -l app=mcp-server -f
```

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (`npm test`)
- [ ] Security audit clean (`npm run audit`)
- [ ] Environment variables documented
- [ ] Secrets stored securely (not in code)
- [ ] mcp-spec.json up to date
- [ ] Health check endpoint configured
- [ ] Logging configured

### Post-Deployment
- [ ] Health check passes
- [ ] Logs streaming correctly
- [ ] Metrics being collected
- [ ] /.well-known endpoint accessible
- [ ] OAuth 2.0 flow functional (if enabled)
- [ ] Performance meets targets

## Performance Configuration

### Connection Pooling

```typescript
// Recommended per MCP best practices
const poolConfig = {
  min: 5,
  max: 20,
  idleTimeoutMs: 30000,
  acquireTimeoutMs: 10000
};
```

### Caching Strategy

Multi-level caching for optimal performance:

| Level | Type | TTL | Use Case |
|-------|------|-----|----------|
| L1 | In-memory | 1 min | Hot data |
| L2 | Redis | 15 min | Warm data |
| L3 | Database | - | Cold data |

### Monitoring

**Prometheus Metrics:**
```typescript
// Essential metrics to export
- mcp_requests_total (counter)
- mcp_request_duration_seconds (histogram)
- mcp_active_connections (gauge)
- mcp_errors_total (counter by type)
```

**Health Endpoints:**
```
GET /health  - Basic liveness
GET /ready   - Readiness with dependency checks
GET /metrics - Prometheus metrics
```

## Reference Files

- `test/src/utils/generator.ts` - Docker file generation
- `test/Dockerfile` - Base Dockerfile template
- `test/docker-compose.yml` - Docker Compose template
