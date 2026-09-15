# 10 — Modelos de Datos y Relaciones

## Diagrama ER Simplificado

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Organization │────>│    User      │<────│ UserRole         │
│              │     │              │     │                  │
│ id           │     │ id           │     │ user_id           │
│ name         │     │ org_id       │     │ role_id           │
│ slug         │     │ email        │     └──────────────────┘
│ country_id   │     │ password     │              │
│ is_active    │     │ is_active    │              │
└──────┬───────┘     └──────────────┘     ┌───────┴───────┐
       │                                  │  Role         │
       │                                  │               │
       │     ┌──────────────────┐         │ id            │
       │     │ RolePermission   │         │ org_id        │
       │     │                  │         │ name          │
       │     │ role_id          │─────────│ is_system     │
       │     │ permission_id    │         └───────────────┘
       │     └────────┬─────────┘                │
       │              │         ┌────────────────┘
       │              │         │
       │              ▼         ▼
       │     ┌──────────────────────┐
       │     │    Permission        │
       │     │    id                │
       │     │    resource          │
       │     │    action            │
       │     └──────────────────────┘
       │
       │     ┌──────────────────┐
       ├────>│    Customer      │
       │     │                  │
       │     │ id, org_id       │
       │     │ doc_type, doc_num│
       │     │ name, email      │
       │     │ phone, address   │
       │     │ is_active        │
       │     └──────────────────┘
       │
       │     ┌──────────────────┐
       ├────>│    Product       │
       │     │                  │
       │     │ id, org_id       │
       │     │ sku, name        │
       │     │ unit_price       │
       │     │ tax_id           │─────> TaxRate
       │     │ type, is_active  │
       │     └──────────────────┘
       │
       │     ┌──────────────────────┐
       ├────>│   Establishment      │
       │     │                      │
       │     │ id, org_id, name     │
       │     │ address, is_active   │
       │     └──────────┬───────────┘
       │                │
       │     ┌──────────▼───────────┐
       │     │  BillingPoint        │
       │     │                      │
       │     │ id, est_id           │
       │     │ code, inv_sequence   │
       │     │ is_active            │
       │     └──────────┬───────────┘
       │                │
       │     ┌──────────▼───────────┐
       ├────>│     Invoice          │
       │     │                      │
       │     │ id, org_id           │
       │     │ bp_id, customer_id   │
       │     │ invoice_number       │
       │     │ subtotal, tax_total  │
       │     │ total, status        │
       │     │ issued_at            │
       │     └──────────┬───────────┘
       │                │
       │     ┌──────────▼───────────┐
       │     │   InvoiceLine        │
       │     │                      │
       │     │ id, invoice_id       │
       │     │ product_id           │
       │     │ qty, unit_price      │
       │     │ tax_rate, subtotal   │
       │     │ total                │
       │     └──────────────────────┘
       │
       │     ┌──────────────────┐
       └────>│   Country        │
             │                  │
             │ id, code, name   │
             │ currency_code    │
             │ decimal_places   │
             │ date_format      │
             │ timezone         │
             └────────┬─────────┘
                      │
             ┌────────▼─────────┐
             │    TaxRate        │
             │                   │
             │ id, country_id    │
             │ name, code        │
             │ rate, type        │
             │ is_default        │
             │ valid_from/until  │
             └───────────────────┘
```

## Modelos Sequelize

### Organization

```typescript
// infrastructure/database/models/organization.model.ts
import { Model, DataType, Table, Column, HasMany, BelongsTo } from 'sequelize-typescript';

@Table({ tableName: 'organizations' })
export class OrganizationModel extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id!: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(100), allowNull: false, unique: true })
  slug!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  countryId!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @HasMany(() => UserModel)
  users!: UserModel[];

  @HasMany(() => CustomerModel)
  customers!: CustomerModel[];

  @HasMany(() => ProductModel)
  products!: ProductModel[];

  @HasMany(() => EstablishmentModel)
  establishments!: EstablishmentModel[];

  @HasMany(() => InvoiceModel)
  invoices!: InvoiceModel[];
}
```

### Customer

```typescript
@Table({ tableName: 'customers', indexes: [
  { unique: true, fields: ['organization_id', 'document_type', 'document_number'] }
]})
export class CustomerModel extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  organizationId!: string;

  @Column({ type: DataType.ENUM('DNI', 'RUT', 'CUIT', 'NIF', 'RFC'), allowNull: false })
  documentType!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  documentNumber!: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING(20) })
  phone?: string;

  @Column({ type: DataType.STRING(500) })
  address?: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}
```

### Invoice (con líneas embebidas)

```typescript
@Table({ tableName: 'invoices' })
export class InvoiceModel extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  organizationId!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  billingPointId!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  customerId!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  invoiceNumber!: string;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  subtotal!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  taxTotal!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  total!: number;

  @Column({ type: DataType.ENUM('draft', 'issued', 'cancelled'), defaultValue: 'draft' })
  status!: string;

  @Column({ type: DataType.DATE })
  issuedAt?: Date;

  @HasMany(() => InvoiceLineModel)
  lines!: InvoiceLineModel[];
}

@Table({ tableName: 'invoice_lines' })
export class InvoiceLineModel extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  invoiceId!: string;

  @Column({ type: DataType.UUID, allowNull: false })
  productId!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  unitPrice!: number;

  @Column({ type: DataType.DECIMAL(5, 2), allowNull: false })
  taxRate!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  subtotal!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  total!: number;
}
```

## Convenciones de Base de Datos

- **Nombres de tablas**: snake_case, plural (`customers`, `invoice_lines`)
- **Nombres de columnas**: snake_case (`organization_id`, `is_active`)
- **Timestamps**: `created_at`, `updated_at` (automáticos con Sequelize)
- **Soft delete**: `deleted_at` (paranoid: true en Sequelize)
- **UUIDs** como primary keys (evita enumeración y conflictos)
- **Índices compuestos** para unique constraints por organización

---

[← Volver al índice](index.md) | [Anterior: API Endpoints](09-api.md) | [Siguiente: Infraestructura →](11-deployment.md)
