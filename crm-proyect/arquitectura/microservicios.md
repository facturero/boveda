# Descomposición en Microservicios

[← Volver al índice](../README.md) · [← Visión general](./vision-general.md)

## Criterio de partición

Cada servicio se define por un **límite de dominio (bounded context)**: agrupa entidades que cambian juntas y por las mismas razones, y que pueden evolucionar sin tocar a los demás. La regla práctica:

> Si dos conceptos casi siempre se modifican en la misma transacción y comparten invariantes, viven en el mismo servicio. Si solo se referencian, viven en servicios distintos y se enlazan por **ID**.

## Tabla de servicios

> **Inventario real al 2026-09-14** (verificado contra el código y contra los despliegues). El diseño original hablaba de un `realtime-service` que nunca existió y daba por futuros varios servicios que ya están construidos.

| Servicio | Dominio (bounded context) | Base de datos | Estado |
|---|---|---|---|
| [auth-service](../servicios/auth-service.md) | Identidad y acceso: autenticación (sin 2FA) + RBAC, terminales POS, IPs de confianza | `auth_db` | desplegado |
| [organization-service](../servicios/organization-service.md) | Organizaciones, establecimientos, puntos de emisión, emparejamiento POS | `organization_db` | desplegado |
| [customer-service](../servicios/customer-service.md) | Clientes, contactos, direcciones, etiquetas | `customer_db` | desplegado |
| [product-service](../servicios/product-service.md) | Productos, categorías, unidades, impuestos por producto, imágenes | `product_db` | desplegado |
| [tax-service](../servicios/tax-service.md) | Catálogos fiscales por país | `tax_db` | desplegado |
| [billing-service](../servicios/billing-service.md) | Facturación comercial: comprobantes, líneas, secuenciales, notas de crédito | `billing_db` | desplegado |
| [fiscal-ecuador](../servicios/fiscal-ecuador.md) | SRI Ecuador: clave de acceso, XML, firma, autorización, RIDE | `fiscal_ec_db` | desplegado |
| [document-service](../servicios/document-service.md) | Archivos: metadatos + MinIO | `document_db` | desplegado |
| [notification-service](../servicios/notification-service.md) | Campana, correo y preferencias | `notification_db` | desplegado |
| [plugin-catalog-service](../servicios/plugin-catalog-service.md) | Catálogo de módulos, activación, perfiles de negocio | `plugin_catalog_db` | desplegado |
| [audit-log-service](../servicios/audit-log-service.md) | Bitácora central (consume `#`) | `audit_db` | desplegado |
| [asistente de IA](../servicios/asistente-ia.md) | Agente que ejecuta dentro del CRM | `assistant_db` | desplegado |
| [inventory-service](../servicios/inventory-service.md) | Bodegas, stock, kardex, costeo FIFO/promedio | `inventory_db` | **construido, sin desplegar** |
| [api-gateway](../servicios/api-gateway.md) | Borde: routing, JWT, plugins, **WebSocket `/ws`** | — | desplegado |

Además, fuera del clúster:

| Pieza | Qué es |
|---|---|
| [POS](../pos/punto-de-venta.md) | Aplicación de escritorio (Tauri) con backend local: caché de catálogo y cola de ventas, offline-first |
| [@facturero/outbox-relay](../servicios/outbox-relay.md) | **Librería npm**, no un servicio: outbox del productor e inbox con reintentos del consumidor |

### Lo que se diseñó y no existe

- **`realtime-service`**: el socket vive en el api-gateway (`/ws`) y las notificaciones en notification-service. Ver [tiempo real](../servicios/realtime-service.md).
- **`identity-service`**: se unificó con auth-service; sus eventos conservan el namespace `identity.*`.

### Servicios futuros

| Servicio | Dominio | Fase |
|---|---|---|
| `payment-service` | Pagos, cuentas por cobrar, estados de cuenta | 2 |
| `pricing-service` | Listas de precios, descuentos, promociones | 2 |
| `reporting-service` | Reportes, dashboards, IVA por declarar | 2 |
| `sales-crm-service` | Leads, oportunidades, pipeline, actividades | 3 |
| `fiscal-<país>` | Adaptadores fiscales de otros países (DIAN, SUNAT, SAT, SII) | según cliente |

## Reglas de oro de la descomposición

1. **Nadie consulta la base de otro servicio.** Solo su API o sus eventos.
2. **Datos duplicados controlados.** Si billing necesita el nombre del cliente, guarda un *snapshot* al emitir; no consulta a customer en cada lectura.
3. **Idempotencia.** Todo consumidor de eventos debe tolerar recibir el mismo evento dos veces.
4. **Contratos versionados.** Cambiar un evento o un endpoint = versionar, no romper.

## Siguiente

- Cómo se comunican en concreto → [comunicación entre servicios](./comunicacion.md)
- Cómo se estructura el código dentro de cada uno → [Clean Architecture](./arquitectura-limpia.md)
