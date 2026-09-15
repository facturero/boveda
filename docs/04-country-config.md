# 04 — Configuración por País

## Motivación

Cada país tiene su propio sistema fiscal, tipos de IVA, moneda, formatos de fecha y documentos legales. Este módulo centraliza esas configuraciones para que el CRM se adapte dinámicamente.

## Tabla: `countries`

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `id` | UUID | |
| `code` | string(2) | `AR`, `CL`, `MX`, `ES`, `CO` |
| `name` | string | Argentina |
| `currency_code` | string(3) | `ARS`, `CLP`, `MXN`, `EUR` |
| `currency_symbol` | string | `$`, `€` |
| `decimal_places` | integer | 2 |
| `date_format` | string | `DD/MM/YYYY` |
| `locale` | string | `es-AR` |
| `timezone` | string | `America/Argentina/Buenos_Aires` |
| `document_types` | jsonb | `["DNI", "CUIT", "CUIL"]` |

## Tabla: `tax_rates`

Cada país puede tener múltiples tasas de IVA.

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `id` | UUID | |
| `country_id` | UUID | FK → Country |
| `name` | string | `IVA General`, `IVA Reducido` |
| `code` | string | `IVA_21`, `IVA_10.5` |
| `rate` | decimal(5,2) | `21.00`, `10.50`, `0.00` |
| `type` | enum | `vat`, `excise`, `special` |
| `is_default` | boolean | Si es la tasa por defecto |
| `is_active` | boolean | |
| `valid_from` | date | Fecha de vigencia |
| `valid_to` | date | Null si está vigente |

### Ejemplo de tasas por país

| País | Tasas |
|------|-------|
| 🇦🇷 Argentina | 21% (general), 10.5% (reducido), 27% (bienes suntuarios), 0% (exento) |
| 🇨🇱 Chile | 19% (general) |
| 🇲🇽 México | 16% (general), 8% (frontera), 0% (exento) |
| 🇪🇸 España | 21% (general), 10% (reducido), 4% (superreducido) |
| 🇨🇴 Colombia | 19% (general), 5% (reducido) |

## Tabla: `country_settings`

Configuraciones adicionales específicas por país.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | |
| `country_id` | UUID | |
| `key` | string | `invoice_required_fields` |
| `value` | jsonb | `["document", "tax_id", "address"]` |

### Ejemplos de settings

| Key | Descripción |
|-----|-------------|
| `invoice_required_fields` | Campos obligatorios en factura |
| `max_invoice_lines` | Máximo de líneas por factura (Chile: 70) |
| `electronic_invoice_enabled` | Soporte para factura electrónica |
| `tax_reporting_code` | Código de producto para reportes fiscales |

## Asociación Organización → País

Cada organización se asocia a un país al crearse:

```
Organization
  ├── country_id → determina:
  │   ├── Tasas de IVA disponibles
  │   ├── Moneda
  │   ├── Formatos de fecha/número
  │   ├── Tipos de documento aceptados
  │   └── Reglas de facturación
  │
  └── Puede tener configuraciones propias que sobrescriban las del país
```

## Comportamiento en Facturación

Al crear una factura:

1. Se obtiene el `country_id` de la organización.
2. Se consulta la tasa de IVA aplicable según el producto y el país.
3. Se calculan subtotal, impuestos y total.
4. Se genera el número de factura según el formato del país.

```typescript
// Ejemplo de lógica de cálculo
function calculateInvoice(invoice: Invoice): CalculatedInvoice {
  const country = getCountry(invoice.organization.country_id);
  const taxRate = getTaxRate(invoice.product.tax_id, country.id);
  
  return {
    subtotal: invoice.lines.reduce(sum, 0),
    tax_total: invoice.lines.reduce((sum, line) => 
      sum + line.subtotal * (taxRate.rate / 100), 0),
    total: subtotal + tax_total,
    currency: country.currency_code
  };
}
```

## Validación por País en Frontend

El frontend obtiene la configuración del país al cargar la organización y adapta:

- Máscaras de inputs (RUT chileno, CUIT argentino, RFC mexicano)
- Formatos de moneda
- Validación de documentos
- Campos requeridos en formularios

---

[← Volver al índice](index.md) | [Anterior: Multiorganizacional](03-multiorganizational.md) | [Siguiente: Microservicios →](05-microservices.md)
