# 12 — Guías de Desarrollo

## Estructura de Carpetas (por Microservicio)

```
services/{nombre}/
  src/
    domain/
      entities/
      value-objects/
      repositories/    # Interfaces
      services/        # Lógica de negocio pura
    application/
      use-cases/
      dto/
    infrastructure/
      database/
        models/
        repositories/ # Implementaciones Sequelize
        migrations/
      http/
        routes/
        middleware/
      websocket/
    shared/             # O importado del paquete shared/
  test/
  package.json
  tsconfig.json
  Dockerfile
```

## Convenciones de Código

### TypeScript

- **Nombres de archivos**: `kebab-case` (`create-customer.use-case.ts`)
- **Clases**: PascalCase (`CreateCustomerUseCase`)
- **Funciones/variables**: camelCase (`getCustomerById`)
- **Interfaces**: Prefijo `I` solo cuando es necesario distinguir de implementaciones
- **Tipos**: Preferir `type` sobre `interface` para unions/tuples

### Nomenclatura de Archivos

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Caso de uso | `{accion}-{entidad}.use-case.ts` | `create-customer.use-case.ts` |
| Controlador | `{entidad}.controller.ts` | `customer.controller.ts` |
| Ruta | `{entidad}.routes.ts` | `customer.routes.ts` |
| Modelo DB | `{entidad}.model.ts` | `customer.model.ts` |
| Schema Zod | `{entidad}.schema.ts` | `customer.schema.ts` |
| DTO | `{entidad}.dto.ts` | `create-customer.dto.ts` |

### Commits

```
feat: agregar creación de clientes
fix: validar email duplicado en la organización
refactor: mover lógica de IVA a Settings Service
docs: agregar documentación de endpoints de facturación
```

## Testing

### Frontend (Vitest + Vue Test Utils)

```typescript
// tests/components/CustomerForm.spec.ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import CustomerForm from '@/components/customers/CustomerForm.vue';

describe('CustomerForm', () => {
  it('should validate required fields', async () => {
    const wrapper = mount(CustomerForm);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('Nombre requerido');
  });
});
```

### Backend (Vitest + Supertest)

```typescript
// tests/use-cases/create-customer.spec.ts
describe('CreateCustomerUseCase', () => {
  it('should create a customer with valid data', async () => {
    const customer = await useCase.execute(validData);
    expect(customer.name).toBe('Juan Pérez');
    expect(customer.organizationId).toBe('org-uuid');
  });

  it('should reject duplicate document number', async () => {
    await useCase.execute(validData);
    await expect(useCase.execute(validData)).rejects.toThrow('DOCUMENT_EXISTS');
  });
});
```

### Pirámide de Testing

```
         ╱╲
        ╱ E2E ╲           < 10% — Cypress / Playwright
       ╱────────╲
      ╱ Integration ╲     ~30%  — Supertest (API)
     ╱────────────────╲
    ╱   Unit Tests     ╲   >60%  — Vitest (use cases, components)
   ╱──────────────────────╲
```

## Manejo de Errores

```typescript
// shared/errors/application-error.ts
export class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(entity: string) {
    super(`${entity} no encontrado`, 'NOT_FOUND', 404);
  }
}

export class BusinessError extends ApplicationError {
  constructor(message: string) {
    super(message, 'BUSINESS_ERROR', 409);
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor() {
    super('No autorizado', 'UNAUTHORIZED', 401);
  }
}
```

## Variables de Entorno

```env
# .env.example
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/dbname

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API Gateway
API_GATEWAY_URL=http://localhost:80

# CORS
CORS_ORIGINS=http://localhost:5173

# Logging
LOG_LEVEL=debug
```

---

[← Volver al índice](index.md) | [Anterior: Infraestructura](11-deployment.md)
