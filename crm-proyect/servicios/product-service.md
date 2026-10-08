# product-service

[← Volver al índice](../README.md) · [customer-service](./customer-service.md) · [tax-service](./tax-service.md) · [billing-service](./billing-service.md)

> [!info] Estado (2026-07-06)
> **Re-especificado (v2)** — el servicio se reconstruye desde cero con los contratos de `backend/product-service/` (`IMPLEMENTATION.md` + `openapi.yaml` + `asyncapi.yaml`). Cambios v2 respecto al primer build: **precios en centavos (BIGINT) con Dinero.js**, **imágenes de producto** (referencias URL con principal + default server-side). Puerto **3006**, BD **`product_db`**.
> - ✅ **Al 2026-09-16** el `OutboxRelay` está cableado y los permisos `product:*` existen. Tablas reales: `products`, `categories`, `units`, `product_taxes`, `product_images`, `product_establishments`, `outbox_messages`, `processed_events`. **No hay tabla `tax_rates`**: la migración `20260709000000-drop-tax-rates-table.cjs` la eliminó y las tasas se piden a tax-service por HTTP.
> - El **SKU del producto** es lo que viaja como `productCode` en `billing.invoice.issued` y acaba en el `codigoPrincipal` del XML del SRI (máx. 25 caracteres). Ver [facturación electrónica](../facturacion-electronica/flujo-end-to-end.md).
> - `product.product.*` dispara `catalog.changed` por el socket del gateway; el POS y el frontend hacen un pull autenticado (el catálogo nunca viaja por el socket).

## Responsabilidad

Dueño del **catálogo de productos** y servicios de cada organización: productos, **categorías**, **unidades de medida**, la **asignación de impuestos** (M:N con el catálogo del país) y las **imágenes** del producto. Particionado por `organization_id`.

## Convención de dinero (aplica a todo el sistema)

- **Montos** se almacenan como **enteros en la unidad mínima** de la moneda (centavos) en columnas `BIGINT`, junto a su `currency_code` (ISO 4217). La aritmética en la app usa **Dinero.js v2** (VO `Money` en el dominio). Nunca `FLOAT`/`DECIMAL` para montos.
- **Tasas/porcentajes** (ej. IVA 15.00) se almacenan como `DECIMAL` — son fracciones, no dinero.
- El API recibe/devuelve el monto en unidad principal como **string** (`"19.99"`) y además expone el entero (`priceCents: 1999`) para consumidores que calculan (billing).

Razón: los floats IEEE-754 no representan decimales exactos; los enteros + Dinero.js dan cálculo exacto, `allocate()` para distribuir sin perder centavos, y BigInt para agregaciones de reportería. Es el patrón de Stripe/Modern Treasury.

## Entidades dueñas (`product_db`)

```mermaid
erDiagram
    CATEGORY ||--o{ PRODUCT : agrupa
    UNIT ||--o{ PRODUCT : mide
    PRODUCT ||--o{ PRODUCT_TAX : grava
    PRODUCT ||--o{ PRODUCT_IMAGE : ilustra

    PRODUCT {
        uuid id PK
        uuid organization_id "★ tenant"
        string sku UK "por organización (nullable)"
        string name
        string description
        enum type "good|service"
        uuid category_id FK
        uuid unit_id FK
        bigint price_cents "precio base en centavos (Dinero.js)"
        string currency_code "ISO 4217 (USD...)"
        bool price_includes_tax "si el precio ya incluye IVA"
        bool track_stock "fase 2: inventario"
        enum status "active|inactive"
        json metadata
    }
    CATEGORY {
        uuid id PK
        uuid organization_id
        string name
        uuid parent_id "jerarquía opcional"
        enum status
    }
    UNIT {
        uuid id PK
        uuid organization_id
        string code "UND, KG, HORA"
        string name
    }
    PRODUCT_TAX {
        uuid id PK
        uuid product_id FK
        uuid tax_rate_id "ref → tax-service (del país)"
        string kind "denormalizado de la tasa: vat|withholding_iva|..."
    }
    PRODUCT_IMAGE {
        uuid id PK
        uuid product_id FK
        uuid organization_id "denormalizado para aislar"
        uuid file_id "ref → files-service (crm-minio)"
        string alt
        bool is_primary
        int position
    }
```

Además `product_establishments` (en qué establecimientos se vende cada producto), `outbox_messages` y `processed_events`. Sin read-model de tasas.

## La pieza clave: asignación de impuestos por país (M:N)

Cada producto se asocia a **una o más** tasas (`PRODUCT_TAX → tax_rate_id`) del catálogo de [tax-service](./tax-service.md) **del país de la organización** (ej. IVA + retención). El servicio valida que la tasa exista y pertenezca al país correcto **preguntando a tax-service por HTTP** (`TaxRateHttpRepository`, `GET /countries/:code/tax-rates`). El nombre del puerto (`TaxRateReadModelRepository`) es del diseño original, que preveía una copia local; esa tabla se eliminó. Si tax-service no responde, no se pueden asignar impuestos. El `kind` **no lo envía el cliente**: se copia de la tasa al asignarla. El set se gestiona con `PUT /products/:id/taxes` (reemplazo completo).

## Imágenes (v2)

- Se guardan **referencias al files-service** (`file_id`) — crm-minio gestiona la subida (presigned), el almacenamiento y la descarga; product **no** toca MinIO ni recibe binarios. Mismo patrón que la foto de perfil (`auth.users.avatar_file_id`).
- Flujo: el front sube al files-service (`POST /files/presigned` con `resourceType: product`, `category: product-image`) → obtiene `fileId` → lo registra aquí (`POST /products/:id/images { fileId }`).
- Varias imágenes por producto, con **una principal** (`is_primary`) y `position` de orden.
- Invariantes: la **primera** imagen se vuelve principal automáticamente; al borrar la principal se **promueve** la siguiente por `position`; `PUT .../images/:id/primary` la cambia.
- La respuesta expone `imageFileId` (de la principal, o `null`) e `images[].fileId`. **El front arma la URL** con el files-service (igual que los avatares); product no devuelve URLs.

## Relación con facturación

[billing-service](./billing-service.md) referencia productos por `product_id` y **congela snapshots** al emitir (nombre, `price_cents`, `currency_code`, `price_includes_tax`, set de impuestos). El payload de `product.product.*` lleva todo eso para que billing no consulte nada. Si cambia el precio/impuesto, solo se actualizan **borradores**; lo emitido es inmutable.

## API REST (resumen — contrato completo en `backend/product-service/openapi.yaml`)

| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/products?search=&status=&type=&categoryId=` | `product:read` |
| GET | `/products/:id` | `product:read` |
| POST | `/products` (acepta `taxRateIds[]` embebido) | `product:create` |
| PATCH | `/products/:id` | `product:update` |
| PUT | `/products/:id/taxes` (reemplaza el set) | `product:update` |
| POST | `/products/:id/disable` (baja lógica) | `product:update` |
| GET/POST | `/products/:id/images` · DELETE `/products/:id/images/:imageId` · PUT `.../:imageId/primary` | `product:read` / `product:update` |
| GET/POST | `/categories` · PATCH/DELETE `/categories/:id` | `product:read` / `product:create` / `product:update` / `product:delete` |
| GET/POST | `/units` · PATCH `/units/:id` | `product:read` / `product:create` / `product:update` |
| GET | `/tax-rates` (proxy a tax-service, para el selector del front) | `product:read` |

Todas filtran por `organization_id` del contexto (gateway); cross-org → `404`. El precio entra como string (`price: "19.99"` + `currencyCode`) y sale dual (`price` + `priceCents`).

## Eventos

**Publica** (payload con `priceCents`, `currencyCode`, `priceIncludesTax`, `taxes[]`, `imageUrl` — snapshot completo):

Verificado 2026-09-16:

| Evento | Cuándo | Lo consume |
|--------|--------|---------------|
| `product.product.created` | Nuevo producto | gateway (hub → `catalog.changed`), [inventory](./inventory-service.md) (read-model) |
| `product.product.updated` | Cambio de datos, precio, impuestos o imágenes (añadir, quitar, cambiar la principal) | gateway, [inventory](./inventory-service.md) |
| `product.product.disabled` | Baja | gateway, [inventory](./inventory-service.md) |
| `product.category.created` / `.updated` / `.deleted` | Categorías | audit |
| `product.unit.created` / `.updated` | Unidades | audit |

billing **no** consume estos eventos: pide el producto por HTTP al añadir la línea.

**Consume:** nada. El descuento de stock al facturar lo hace [inventory-service](./inventory-service.md), no este servicio.

## Dependencias

- **tax-service**: validar tasas por país, **por HTTP** en cada asignación.
- **organization-service**: establecimientos, por HTTP (`establishment-http-repository`).
- Lo consultan por HTTP [billing](./billing-service.md) y el [POS](../pos/punto-de-venta.md); inventory y el gateway escuchan sus eventos.

## Validaciones (ver [validación](../arquitectura/validacion.md))

- **Borde (Zod)**: `price` string decimal válido, `type` ∈ {good, service}, `sku` formato, `url` de imagen URI válida.
- **Dominio**:
  - `Money.fromDecimalString` valida monto y moneda soportada (`InvalidMoneyAmountError` / `InvalidCurrencyError`).
  - `tax_rate_id` existe y pertenece al **país de la organización**.
  - `sku` único por organización; `unit.code` único por organización.
  - Un producto `service` no controla stock.
  - Imagen: referencia obligatoria; invariantes de principal (primera/promoción).

## Notas

- `price_includes_tax` define si el precio capturado ya trae IVA (retail) o no; billing lo usa para calcular base e impuesto.
- `track_stock` conecta con [inventory-service](./inventory-service.md), desplegado desde el 2026-09-15.
- Listas de precios por cliente/moneda → `pricing-service` en fase 2; aquí queda el precio base.
- Paginación de listados: pendiente de definir globalmente (aplicará a todos los servicios a la vez).
