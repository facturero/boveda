# 08 — Estrategia de Validación

## Filosofía: Validación por Capas

Toda entrada de datos se valida en **ambos lados** (frontend y backend) usando los **mismos esquemas Zod** compartidos.

```
Frontend (Vue + Vuetify)
  │
  │ 1. Validación visual en tiempo real (Vuetify rules)
  │ 2. Validación completa al submit (Zod schema)
  │
  ══════ Envío HTTP ══════
  │
Backend (HonoJS + Zod)
  │
  │ 3. Middleware de validación (Zod schema)
  │ 4. Validación de negocio en Use Cases
  │ 5. Constraints a nivel de base de datos (Sequelize)
```

## Esquemas Compartidos (Shared Package)

Crear un paquete `shared/validation/` que se importa tanto en frontend como en backend:

```
shared/
  validation/
    customer.schema.ts
    product.schema.ts
    invoice.schema.ts
    user.schema.ts
    establishment.schema.ts
    country-config.schema.ts
    common.schema.ts       # Tipos reutilizables (email, phone, RUT, etc.)
```

## Validación en Frontend (Vue 3 + Vuetify + Zod)

### Enfoque por Componente

```typescript
// components/customers/CustomerForm.vue
import { customerSchema } from '@shared/validation/customer.schema';

const form = ref({
  name: '',
  email: '',
  documentType: 'DNI',
  documentNumber: '',
  phone: '',
});

const errors = ref<Record<string, string[]>>({});

async function handleSubmit() {
  const result = customerSchema.safeParse(form.value);
  
  if (!result.success) {
    errors.value = formatZodErrors(result.error);
    return;
  }
  
  // Enviar al backend
  await customerService.create(result.data);
}
```

### Vuetify Rules desde Zod

```typescript
// utils/zodToRules.ts
function zodToRules(schema: ZodType, field: string) {
  return [
    (value: any) => {
      const result = schema.shape[field].safeParse(value);
      return result.success || result.error.errors[0].message;
    }
  ];
}

// Uso en template
<v-text-field
  v-model="form.email"
  :rules="zodToRules(customerSchema, 'email')"
  label="Email"
/>
```

## Validación en Backend (HonoJS + Zod)

### Middleware de Validación

```typescript
// infrastructure/http/middleware/validate.ts
import { z } from 'zod';
import { createMiddleware } from 'hono/factory';

export function validate(schema: z.ZodSchema) {
  return createMiddleware(async (c, next) => {
    const body = await c.req.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      return c.json({
        error: 'VALIDATION_ERROR',
        details: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, 422);
    }
    
    c.set('validated', result.data);
    await next();
  });
}
```

### Uso en los Controladores

```typescript
// infrastructure/http/routes/customer.routes.ts
app.post('/api/v1/customers', 
  validate(customerSchema),
  async (c) => {
    const data = c.get('validated');
    const result = await createCustomerUseCase.execute(data);
    return c.json(result, 201);
  }
);
```

## Validación de Negocio (Use Cases)

Además de la validación de esquema, los casos de uso aplican reglas de negocio:

```typescript
// application/use-cases/create-invoice.use-case.ts
export class CreateInvoiceUseCase {
  async execute(data: CreateInvoiceDTO): Promise<Invoice> {
    // Validar que el cliente pertenezca a la misma organización
    const customer = await this.customerRepo.findById(data.customerId);
    if (customer.organizationId !== data.organizationId) {
      throw new BusinessError('El cliente no pertenece a esta organización');
    }
    
    // Validar stock del producto
    for (const line of data.lines) {
      const product = await this.productRepo.findById(line.productId);
      if (product.stock < line.quantity) {
        throw new BusinessError(`Stock insuficiente para ${product.name}`);
      }
    }
    
    // Validar límite de facturación del punto
    const billingPoint = await this.billingPointRepo.findById(data.billingPointId);
    // ... reglas de negocio
  }
}
```

## Validación a Nivel de Base de Datos (Sequelize)

```typescript
// infrastructure/database/models/customer.model.ts
export class CustomerModel extends Model {
  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  })
  name!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: 'customer_email_org'  // Unique compuesto con organization_id
  })
  email!: string;
}
```

## Esquemas Zod de Ejemplo

### Cliente

```typescript
// shared/validation/customer.schema.ts
import { z } from 'zod';

export const documentTypes = ['DNI', 'RUT', 'CUIT', 'NIF', 'RFC'] as const;

export const customerSchema = z.object({
  name: z.string().min(2, 'Nombre debe tener al menos 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  documentType: z.enum(documentTypes),
  documentNumber: z.string().min(4, 'Documento inválido').max(20),
  phone: z.string().regex(/^\+?[\d\s-]{7,15}$/, 'Teléfono inválido').optional(),
  address: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerSchema>;
```

### Producto

```typescript
// shared/validation/product.schema.ts
import { z } from 'zod';

export const productSchema = z.object({
  sku: z.string().min(1, 'SKU requerido').max(50),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  unitPrice: z.number().positive('Precio debe ser mayor a 0'),
  taxId: z.string().uuid('Tasa de IVA inválida'),
  type: z.enum(['product', 'service']),
  isActive: z.boolean().default(true),
});
```

### Factura

```typescript
// shared/validation/invoice.schema.ts
import { z } from 'zod';

export const invoiceLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Cantidad debe ser mayor a 0'),
  unitPrice: z.number().positive(),
});

export const invoiceSchema = z.object({
  customerId: z.string().uuid('Cliente inválido'),
  billingPointId: z.string().uuid('Punto de facturación inválido'),
  lines: z.array(invoiceLineSchema).min(1, 'Debe tener al menos un producto'),
  notes: z.string().max(500).optional(),
});
```

## Mapa de Validaciones

| Capa | Qué valida | Cómo falla |
|------|-----------|------------|
| Vuetify Rules | Formato visual, required, longitud | Mensaje inline en el campo |
| Zod (frontend) | Esquema completo antes de enviar | Errores agrupados, no se envía |
| Zod (backend) | Esquema completo al recibir | HTTP 422 con detalles |
| Use Cases | Reglas de negocio | HTTP 400 / 409 con mensaje |
| Base de datos | Constraints, unique, FK | HTTP 500 (manejado como 409) |

## Errores Estandarizados

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Error de validación en los datos enviados",
  "details": [
    {
      "field": "email",
      "message": "Email inválido",
      "code": "invalid_string"
    },
    {
      "field": "documentNumber",
      "message": "Documento inválido",
      "code": "too_small"
    }
  ]
}
```

---

[← Volver al índice](index.md) | [Anterior: Tiempo Real](07-realtime.md) | [Siguiente: API Endpoints →](09-api.md)
