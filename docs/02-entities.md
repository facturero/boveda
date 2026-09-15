# 02 — Entidades del CRM

## Catálogo de Entidades

### Organización (`Organization`)
Entidad raíz. Representa una empresa o tenant dentro del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `name` | string | Nombre legal |
| `slug` | string | Identificador único para subdominio |
| `country_id` | UUID | País al que pertenece → [Configuración por País](04-country-config.md) |
| `is_active` | boolean | Si la organización está activa |

### País (`Country`)
Define configuraciones regionales.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | |
| `code` | string | Código ISO (AR, CL, MX, ES, etc.) |
| `name` | string | Nombre del país |
| `currency_code` | string | Código de moneda (ARS, CLP, MXN, EUR) |
| `locale` | string | es-AR, es-CL, etc. |

→ Ver [Configuración por País](04-country-config.md) para IVA y más.

### Usuario (`User`)
Persona que accede al sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | |
| `organization_id` | UUID | FK → Organization |
| `email` | string | Único dentro de la organización |
| `password_hash` | string | Hash bcrypt |
| `is_active` | boolean | |

### Rol (`Role`)
Agrupación de permisos.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `organization_id` | UUID |
| `name` | string |
| `is_system` | boolean |

**Roles por defecto por organización:**
- `superadmin` — Dueño de la organización
- `admin` — Administrador
- `manager` — Gerente
- `cashier` — Cajero / punto de facturación
- `viewer` — Solo lectura

### Permiso (`Permission`)
Privilegios atómicos.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `resource` | string | Ej: `customers`, `products`, `invoices` |
| `action` | string | `create`, `read`, `update`, `delete`, `export` |

### Rol-Permiso (`RolePermission`)
Relación muchos a muchos entre roles y permisos.

### Usuario-Rol (`UserRole`)
Asigna roles a usuarios. Un usuario puede tener múltiples roles.

### Cliente (`Customer`)
Entidad de negocio principal.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `organization_id` | UUID |
| `document_type` | enum (DNI, RUT, CUIT, NIF, etc.) |
| `document_number` | string |
| `name` | string |
| `email` | string |
| `phone` | string |
| `address` | string |
| `is_active` | boolean |

### Producto (`Product`)
Bien o servicio comercializable.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `organization_id` | UUID |
| `sku` | string |
| `name` | string |
| `description` | text |
| `unit_price` | decimal |
| `tax_id` | UUID | FK → TaxRate → [IVA por País](04-country-config.md) |
| `is_active` | boolean |
| `type` | enum | `product`, `service` |

### Establecimiento (`Establishment`)
Sucursal o local físico.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `organization_id` | UUID |
| `name` | string |
| `address` | string |
| `is_active` | boolean |

### Punto de Facturación (`BillingPoint`)
Caja o punto de emisión de facturas dentro de un establecimiento.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `establishment_id` | UUID | FK → Establishment |
| `code` | string | Código interno (ej: CAJA-01) |
| `invoice_sequence` | integer | Número de factura actual |
| `is_active` | boolean |

### Factura (`Invoice`)
Documento fiscal generado en un punto de facturación.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `organization_id` | UUID |
| `billing_point_id` | UUID | FK → BillingPoint |
| `customer_id` | UUID | FK → Customer |
| `invoice_number` | string | Número único (secuencia del punto) |
| `subtotal` | decimal | |
| `tax_total` | decimal | |
| `total` | decimal | |
| `status` | enum | `draft`, `issued`, `cancelled` |
| `issued_at` | datetime | |

### Línea de Factura (`InvoiceLine`)
Detalle de ítems en una factura.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `invoice_id` | UUID | FK → Invoice |
| `product_id` | UUID | FK → Product |
| `quantity` | integer | |
| `unit_price` | decimal | |
| `tax_rate` | decimal | Valor del IVA aplicado en el momento |
| `subtotal` | decimal | |
| `total` | decimal | |

---

## Mapa de Relaciones

```
Organization (1) ──── has many ────> User
Organization (1) ──── has many ────> Customer
Organization (1) ──── has many ────> Product
Organization (1) ──── has many ────> Establishment
Organization (1) ──── has many ────> Invoice
Organization (1) ──── has many ────> Role

Establishment (1) ──── has many ────> BillingPoint
BillingPoint (1) ──── has many ────> Invoice
Customer (1) ──── has many ────> Invoice
Invoice (1) ──── has many ────> InvoiceLine
InvoiceLine (1) ──── belongs to ────> Product

Role (M) ──── belongs to many ────> Permission (M)
User (M) ──── belongs to many ────> Role (M)
```

---

[← Volver al índice](index.md) | [Anterior: Visión General](01-overview.md) | [Siguiente: Estructura Multiorganizacional →](03-multiorganizational.md)
