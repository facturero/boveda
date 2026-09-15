# CRM Multiorganizacional — Documentación

Este documento describe la arquitectura, entidades y relaciones de un sistema CRM multiorganizacional con microservicios, diseñado para ser flexible por país y escalable.

---

## Estructura de la Documentación

| # | Archivo | Descripción |
|---|---------|-------------|
| 01 | [Visión General y Stack Tecnológico](01-overview.md) | Stack (Vue3, HonoJS, TypeScript, etc.) y visión del proyecto |
| 02 | [Entidades del CRM](02-entities.md) | Clientes, productos, usuarios, roles, permisos |
| 03 | [Estructura Multiorganizacional](03-multiorganizational.md) | Aislamiento por organización, datos compartidos |
| 04 | [Configuración por País](04-country-config.md) | IVA, moneda, formatos, regulaciones locales |
| 05 | [Arquitectura de Microservicios](05-microservices.md) | Servicios, API Gateway, comunicación entre servicios |
| 06 | [Autenticación y Autorización](06-auth.md) | Auth Service, JWT, RBAC, OAuth2 |
| 07 | [Comunicación en Tiempo Real](07-realtime.md) | Socket.IO, eventos, notificaciones |
| 08 | [Estrategia de Validación](08-validation.md) | Validación frontend (Vuetify) y backend (Zod) |
| 09 | [API — Endpoints](09-api.md) | REST endpoints, WebSocket, respuestas estándar |
| 10 | [Modelos de Datos y Relaciones](10-data-models.md) | Diagramas entidad-relación, schemas Sequelize |
| 11 | [Infraestructura y Despliegue](11-deployment.md) | Docker, CI/CD, monitoreo |
| 12 | [Guías de Desarrollo](12-guidelines.md) | Estándares de código, testing, convenciones |

---

## Mapa de Relaciones entre Entidades

```
Organización
  ├── Usuarios ──── Roles ──── Permisos
  ├── Clientes
  ├── Productos ──── Precios (por país/organización)
  ├── Establecimientos ──── Puntos de Facturación
  │                            └── Facturas ──── Líneas de Factura
  └── Configuración ──── País ──── IVA / Moneda / Formatos
```

---

## Flujo de Alto Nivel

1. El **Auth Service** valida al usuario y devuelve un JWT con organización y rol.
2. Cada petición pasa por el **API Gateway**, que verifica el token y enruta al microservicio correspondiente.
3. El microservicio aplica **aislamiento por organización** (`organization_id`) y **reglas de país** (tablas de IVA, moneda).
4. Los cambios relevantes se propagan en **tiempo real** vía Socket.IO a los clientes conectados.
5. Toda entrada de datos se valida **tanto en frontend como en backend** con esquemas compartidos.
