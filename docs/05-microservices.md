# 05 — Arquitectura de Microservicios

## Diagrama de Servicios

```
                    ┌─────────────────────────┐
                    │      API Gateway         │
                    │   (Nginx / Traefik)      │
                    │  Auth + Rate Limit + Log  │
                    └────┬──────┬──────┬───────┘
                         │      │      │
              ┌──────────┘      │      └──────────┐
              ▼                 ▼                  ▼
      ┌──────────────┐ ┌──────────────┐ ┌────────────────┐
      │  Auth Service │ │   Core API   │ │ Billing Service│
      │  (usuarios,   │ │ (clientes,   │ │ (facturas,      │
      │   roles, jwt) │ │  productos,  │ │  pagos)         │
      └──────┬───────┘ │  establec.)  │ └───────┬────────┘
             │         └──────┬───────┘         │
             │                │                  │
             ▼                ▼                  ▼
      ┌──────────────┐ ┌──────────────┐ ┌────────────────┐
      │  Settings    │ │    Report    │ │ Notifications   │
      │  Service     │ │    Service   │ │   Service       │
      │ (países, IVA,│ │ (dashboard,  │ │ (Socket.IO,     │
      │  config.)    │ │  analytics)   │ │  email, push)   │
      └──────────────┘ └──────────────┘ └────────────────┘
```

## Lista de Microservicios

| Servicio | Responsabilidad | Base de datos |
|----------|----------------|---------------|
| **Auth Service** | Login, registro, JWT, roles, permisos | PostgreSQL (auth_db) |
| **Core API** | CRUD de clientes, productos, establecimientos, puntos de facturación | PostgreSQL (core_db) |
| **Billing Service** | Facturación, cálculo de impuestos, secuencias numéricas | PostgreSQL (billing_db) |
| **Settings Service** | Países, tasas de IVA, configuraciones | PostgreSQL (settings_db) |
| **Report Service** | Reportes, dashboards, exportaciones | PostgreSQL (report_db) / Redis |
| **Notification Service** | Notificaciones en tiempo real, emails, push | Redis + cola de mensajes |

## API Gateway

El **API Gateway** es el punto de entrada único. Sus responsabilidades:

1. **Autenticación**: Validar JWT en cada request.
2. **Routing**: Derivar a cada microservicio según la ruta (`/api/v1/customers` → Core API).
3. **Rate Limiting**: Limitar peticiones por organización/usuario.
4. **Logging**: Registrar todas las peticiones.
5. **CORS**: Manejar políticas de origen cruzado.
6. **Extracción de tenant**: Leer subdominio y obtener `organization_id`.

### Rutas de ejemplo

| Ruta | Método | Microservicio |
|------|--------|---------------|
| `/api/v1/auth/*` | ALL | Auth Service |
| `/api/v1/customers/*` | ALL | Core API |
| `/api/v1/products/*` | ALL | Core API |
| `/api/v1/establishments/*` | ALL | Core API |
| `/api/v1/invoices/*` | ALL | Billing Service |
| `/api/v1/countries/*` | ALL | Settings Service |
| `/api/v1/tax-rates/*` | ALL | Settings Service |
| `/api/v1/reports/*` | ALL | Report Service |
| `/ws/*` | WS | Notification Service |

## Comunicación entre Servicios

### Síncrona: REST sobre HTTP

Para operaciones que requieren respuesta inmediata:

```typescript
// Core API necesita validar un token
const user = await authService.validateToken(token);

// Billing Service necesita datos del cliente
const customer = await coreApi.getCustomer(customerId);
```

### Asíncrona: Eventos / Message Queue

Para operaciones que no requieren respuesta inmediata:

| Evento | Emisor | Receptores | Propósito |
|--------|--------|------------|-----------|
| `customer.created` | Core API | Report, Notification | Actualizar dashboard y notificar |
| `invoice.issued` | Billing | Report, Notification, Core API | Actualizar reportes, notificar al cliente |
| `user.role_changed` | Auth | Core API | Revalidar permisos en caché |
| `product.updated` | Core API | Billing, Report | Actualizar precios en facturas pendientes |

## Clean Architecture por Servicio

Cada microservicio sigue **Arquitectura Limpia**:

```
src/
  domain/
    entities/        # Entidades de negocio
    value-objects/   # Objetos de valor (Email, RUT, etc.)
    repositories/    # Interfaces de repositorio
    services/        # Lógica de negocio pura
  
  application/
    use-cases/       # Casos de uso (CreateCustomer, IssueInvoice)
    dto/             # Data Transfer Objects
    interfaces/      # Puertos (salida)
  
  infrastructure/
    database/        # Implementaciones Sequelize de repositorios
    http/            # Controladores HonoJS
    websocket/       # Manejadores Socket.IO
    cache/           # Redis
    messaging/       # Cola de eventos
  
  shared/
    validation/      # Esquemas Zod (compartidos con frontend)
    errors/          # Clases de error
    middleware/      # Middlewares comunes
```

## Beneficios de esta Arquitectura

1. **Escalabilidad independiente**: El Billing Service puede escalarse sin afectar al Core API.
2. **Aislamiento de fallos**: Si el Report Service falla, la facturación sigue funcionando.
3. **Despliegue independiente**: Cada servicio se deploya por separado.
4. **Equipos paralelos**: Distintos equipos pueden trabajar en distintos servicios.
5. **Tecnología flexible**: Cada servicio podría usar su stack ideal (aunque aquí uniformizamos con HonoJS + Sequelize).

---

[← Volver al índice](index.md) | [Anterior: Configuración por País](04-country-config.md) | [Siguiente: Autenticación →](06-auth.md)
