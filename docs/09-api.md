# 09 — API — Endpoints

## Convenciones Generales

- **Base URL**: `https://{org_slug}.app.crm.com/api/v1`
- **Formato**: JSON siempre
- **Autenticación**: `Authorization: Bearer <jwt>`
- **Paginación**: `?page=1&limit=20` — respuesta incluye `{ data, total, page, limit, totalPages }`
- **Filtros**: `?search=term&field=value`
- **Ordenamiento**: `?sort=field:asc|desc`

## Códigos de Respuesta

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado |
| 204 | Sin contenido (eliminación) |
| 400 | Bad Request |
| 401 | No autenticado |
| 403 | No autorizado (falta permiso) |
| 404 | No encontrado |
| 409 | Conflicto (regla de negocio) |
| 422 | Error de validación |
| 500 | Error interno |

## Auth Service

### `POST /auth/login`
```json
{
  "email": "user@company.com",
  "password": "***"
}
// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "organization": { "id": "uuid", "name": "...", "slug": "..." }
}
```

### `POST /auth/refresh`
```json
{ "refreshToken": "eyJ..." }
// Response 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

### `POST /auth/logout`
```json
{ "refreshToken": "eyJ..." }
// Response 204
```

### `POST /auth/change-password`
```json
{ "currentPassword": "***", "newPassword": "***" }
// Response 204
```

### `GET /auth/me`
```json
// Response 200
{ "id": "uuid", "email": "...", "roles": [...], "permissions": [...] }
```

### Gestión de Usuarios (solo admin/superadmin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/auth/users` | Listar usuarios de la org |
| GET | `/auth/users/:id` | Obtener usuario |
| POST | `/auth/users` | Crear usuario |
| PUT | `/auth/users/:id` | Actualizar usuario |
| DELETE | `/auth/users/:id` | Desactivar usuario |
| PUT | `/auth/users/:id/roles` | Asignar roles |
| PUT | `/auth/users/:id/establishments` | Asignar establecimientos |

## Core API

### Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/customers` | Listar clientes (paginado, filtrable) |
| GET | `/customers/:id` | Obtener cliente |
| POST | `/customers` | Crear cliente |
| PUT | `/customers/:id` | Actualizar cliente |
| DELETE | `/customers/:id` | Eliminar (soft delete) |
| GET | `/customers/:id/invoices` | Facturas del cliente |

### Productos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/products` | Listar productos |
| GET | `/products/:id` | Obtener producto |
| POST | `/products` | Crear producto |
| PUT | `/products/:id` | Actualizar producto |
| DELETE | `/products/:id` | Eliminar (soft delete) |
| PATCH | `/products/:id/stock` | Actualizar stock |

### Establecimientos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/establishments` | Listar establecimientos |
| GET | `/establishments/:id` | Obtener establecimiento |
| POST | `/establishments` | Crear establecimiento |
| PUT | `/establishments/:id` | Actualizar establecimiento |

### Puntos de Facturación

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/establishments/:estId/billing-points` | Listar puntos |
| GET | `/billing-points/:id` | Obtener punto |
| POST | `/establishments/:estId/billing-points` | Crear punto |
| PUT | `/billing-points/:id` | Actualizar punto |

## Billing Service

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/invoices` | Listar facturas (paginado, filtrable) |
| GET | `/invoices/:id` | Obtener factura con líneas |
| POST | `/invoices` | Crear/emitir factura |
| PUT | `/invoices/:id` | Actualizar factura (si es draft) |
| POST | `/invoices/:id/cancel` | Anular factura |
| GET | `/invoices/:id/pdf` | Descargar PDF |
| GET | `/invoices/stats` | Estadísticas (totales por período) |

## Settings Service

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/countries` | Listar países |
| GET | `/countries/:id` | Obtener país con config |
| GET | `/countries/:id/tax-rates` | Tasas de IVA del país |
| GET | `/tax-rates` | Tasas de IVA (filtrable por país) |
| GET | `/tax-rates/:id` | Obtener tasa de IVA |

## Report Service

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reports/sales/daily` | Ventas del día |
| GET | `/reports/sales/monthly` | Ventas del mes |
| GET | `/reports/sales/by-customer` | Ventas por cliente |
| GET | `/reports/sales/by-product` | Ventas por producto |
| GET | `/reports/tax/summary` | Resumen de impuestos |
| GET | `/reports/dashboard` | Datos para dashboard principal |

---

[← Volver al índice](index.md) | [Anterior: Validación](08-validation.md) | [Siguiente: Modelos de Datos →](10-data-models.md)
