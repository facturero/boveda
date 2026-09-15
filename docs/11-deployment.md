# 11 — Infraestructura y Despliegue

## Containerización (Docker)

Cada microservicio tiene su propio `Dockerfile`:

```dockerfile
# Dockerfile (cada servicio)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Docker Compose (Desarrollo Local)

```yaml
# docker-compose.yml
version: '3.8'
services:
  gateway:
    build: ./gateway
    ports: ["80:80"]
    depends_on: [auth-service, core-api, billing-service]

  auth-service:
    build: ./services/auth
    environment:
      - DATABASE_URL=postgres://user:pass@auth-db:5432/auth
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on: [auth-db, redis]

  core-api:
    build: ./services/core
    environment:
      - DATABASE_URL=postgres://user:pass@core-db:5432/core
    depends_on: [core-db]

  billing-service:
    build: ./services/billing
    environment:
      - DATABASE_URL=postgres://user:pass@billing-db:5432/billing
    depends_on: [billing-db]

  notification-service:
    build: ./services/notification
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on: [redis]
    ports: ["3001:3000"]  # Socket.IO

  redis:
    image: redis:7-alpine

  auth-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: auth
      
  core-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: core
      
  billing-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: billing
```

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
    
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run test
  
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [auth, core, billing, notification]
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t crm/${{ matrix.service }} ./services/${{ matrix.service }}
      - run: docker push crm/${{ matrix.service }}
  
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/
```

## Estructura de Archivos por Servicio

```
services/
  auth/
    src/
    Dockerfile
    package.json
    tsconfig.json
  core/
    src/
    Dockerfile
    package.json
  billing/
    src/
    Dockerfile
    package.json
  notification/
    src/
    Dockerfile
    package.json

shared/
  validation/
    customer.schema.ts
    product.schema.ts
    invoice.schema.ts
    ...

gateway/
  nginx.conf
  Dockerfile

k8s/
  auth-deployment.yaml
  core-deployment.yaml
  billing-deployment.yaml
  notification-deployment.yaml
  ingress.yaml
```

## Monitoreo

| Herramienta | Propósito |
|-------------|-----------|
| **Prometheus** | Métricas de cada servicio |
| **Grafana** | Dashboards de monitoreo |
| **Sentry** | Captura de errores en frontend y backend |
| **Winston / Pino** | Logging estructurado en cada servicio |
| **Health checks** | Endpoints `/health` en cada servicio |

---

[← Volver al índice](index.md) | [Anterior: Modelos de Datos](10-data-models.md) | [Siguiente: Guías de Desarrollo →](12-guidelines.md)
