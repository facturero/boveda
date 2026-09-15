# Visión General de la Arquitectura

[← Volver al índice](../README.md)

> **Revisado el 2026-09-14.** El diagrama y el texto se corrigieron contra el código: no existe `realtime-service` (el socket está en el gateway) y se sumaron los servicios construidos después. Inventario completo en [microservicios](./microservicios.md).

## Contexto del sistema

El sistema es una plataforma SaaS **multiorganizacional** donde múltiples empresas (organizaciones) gestionan sus clientes, productos y, sobre todo, **emiten comprobantes electrónicos** según las reglas fiscales de su país.

```mermaid
graph TB
    subgraph Cliente
        Web[SPA Vue 3 + Vuetify]
    end

    subgraph Borde
        GW["API Gateway<br/>+ Socket.IO /ws"]
    end

    subgraph Servicios
        AUTH[auth-service<br/>identidad y acceso]
        ORG[organization-service]
        CUST[customer-service]
        PROD[product-service]
        TAX[tax-service]
        BILL[billing-service]
        FISC[fiscal-ecuador]
        DOC[document-service]
        NOTIF[notification-service]
        PLUG[plugin-catalog-service]
        AUD[audit-log-service]
    end

    subgraph Infra
        MQ[(RabbitMQ)]
        MINIO[(MinIO)]
    end

    Web -->|HTTPS REST| GW
    Web -.->|WebSocket /ws| GW
    GW --> AUTH
    GW --> ORG
    GW --> CUST
    GW --> PROD
    GW --> TAX
    GW --> BILL
    GW --> FISC
    GW --> DOC
    GW --> NOTIF
    GW --> PLUG
    GW --> AUD

    AUTH -. eventos .-> MQ
    ORG -. eventos .-> MQ
    CUST -. eventos .-> MQ
    PROD -. eventos .-> MQ
    BILL -. eventos .-> MQ
    MQ -. consume .-> GW
    MQ -. consume .-> FISC
    MQ -. consume .-> NOTIF
    MQ -. consume .-> AUD
    MQ -. consume .-> BILL
    MQ -. consume .-> AUTH

    DOC --- MINIO
```

## Principios de diseño

1. **Un servicio, una responsabilidad, una base de datos.** Cada microservicio es dueño de su modelo de datos y lo expone solo por su API. Ver [microservicios](./microservicios.md).
2. **Comunicación explícita.** Síncrona por REST a través del [gateway](../servicios/api-gateway.md) para consultas; asíncrona por [eventos en RabbitMQ](./comunicacion.md) para propagar cambios.
3. **Multitenancy por diseño.** El `organizationId` está presente en cada entidad de negocio y se propaga en cada request y cada evento. Ver [multiorganizacional](./multiorganizacional.md).
4. **Configuración fiscal por país, no por organización.** Las tablas de IVA, tipos de identificación y comprobantes son datos de plataforma versionados por país. Ver [tax-service](../servicios/tax-service.md).
5. **Clean Architecture en cada servicio.** El dominio no depende de Hono ni de Sequelize. Ver [arquitectura-limpia](./arquitectura-limpia.md).
6. **Validar en todas las fronteras.** Vuetify + Zod en el cliente para UX; Zod en el borde de cada API; invariantes de negocio en el dominio. Ver [validación](./validacion.md).
7. **No confiar nunca en el cliente.** Toda validación del front se repite en el back.

## Vista lógica por capas

| Capa | Componentes | Responsabilidad |
|------|-------------|-----------------|
| Presentación | SPA Vue 3 | UI, UX, validación inmediata, estado local |
| Borde | API Gateway (REST + Socket.IO `/ws`) | Autenticación de borde, routing, plugins por ruta, propagación de contexto, push en tiempo real |
| Aplicación | 6 microservicios | Lógica de negocio por dominio |
| Integración | RabbitMQ | Eventos de dominio, desacople temporal |
| Datos | MySQL ×N, Redis | Persistencia aislada por servicio + cache |

## Flujo representativo: emitir una factura

Resume cómo colaboran los servicios (detalle en [billing-service](../servicios/billing-service.md) y [comunicación](./comunicacion.md)):

```mermaid
sequenceDiagram
    participant U as SPA
    participant GW as Gateway
    participant B as billing-service
    participant MQ as RabbitMQ
    participant RT as api-gateway (hub /ws)

    U->>GW: POST /invoices (JWT con orgId)
    GW->>B: reenvía + X-Organization-Id, X-User-Id
    B->>B: valida (Zod) + resuelve impuestos del país
    B->>B: asigna secuencial del punto de facturación
    B->>B: persiste factura + Outbox (misma transacción)
    B-->>GW: 201 Created
    GW-->>U: factura creada
    B->>MQ: invoice.issued (desde Outbox)
    MQ->>RT: consume billing.invoice.issued
    RT-->>U: emite a la sala user:{uid} (campana en vivo)
```

## Decisiones clave registradas

| Decisión | Elección | Por qué |
|----------|----------|---------|
| Aislamiento de tenant | Base compartida por servicio + `organizationId` (row-level) | Muchas organizaciones pequeñas; menor costo operativo. Alternativas en [multiorganizacional](./multiorganizacional.md) |
| Config. fiscal | Catálogo de plataforma por país | Países comparten reglas; evita duplicar IVA por organización |
| auth + identity | Un solo servicio (identidad y acceso) | Auth no puede firmar el token sin los permisos; separarlos solo añade sincronización. Ver [auth-service](../servicios/auth-service.md) y [autorización](./autorizacion.md) |
| Numeración de comprobantes | La posee billing-service | Garantiza atomicidad y secuencias sin huecos |
| Tiempo real | Servicio dedicado que consume eventos | Desacopla el push de la lógica de negocio |

## Por dónde seguir

- ¿Cómo se parten los servicios? → [microservicios](./microservicios.md)
- ¿Cómo se hablan? → [comunicación](./comunicacion.md)
- ¿Cómo funciona el multitenant y el multipaís? → [multiorganizacional](./multiorganizacional.md)
