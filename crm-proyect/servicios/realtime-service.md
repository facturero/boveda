# Tiempo real (no hay realtime-service)

[← Volver al índice](../README.md) · [api-gateway](./api-gateway.md) · [notification-service](./notification-service.md) · [arquitectura de tiempo real](../arquitectura/tiempo-real.md)

> ⚠️ **Este documento describía un `realtime-service` que nunca se construyó.** No existe tal servicio y no está previsto. Lo que se diseñó aquí se repartió en dos sitios:
>
> - el **socket** vive dentro del [api-gateway](./api-gateway.md), en `/ws`;
> - las **notificaciones persistentes** (la campana, el correo, las preferencias) viven en [notification-service](./notification-service.md).
>
> Contenido actualizado el 2026-09-14 para reflejar lo que hay.

## Por qué el socket está en el gateway

El gateway ya autentica con el mismo JWT (RS256) de auth-service y ya conoce la organización activa de cada petición. Montar Socket.IO sobre su servidor HTTP evita un servicio más, un segundo sitio donde validar tokens y un salto de red por mensaje.

El hub (`src/realtime/hub.ts`) se suscribe a `crm.events` en RabbitMQ y reparte a salas.

## Salas

| Sala | De dónde sale | Para qué |
|---|---|---|
| `catalog:<orgId>` | claim `org_id` | cambios de catálogo y de plugins de esa organización |
| `user:<uid>` | claim `sub` | notificaciones y cambios de permisos de esa persona |
| `device:<sub>` | claim `sub` en terminales POS (`sub` = id del equipo) | órdenes dirigidas a un POS concreto |

## Qué se reenvía

| Evento consumido | Se emite | A quién |
|---|---|---|
| `product.product.*` | `catalog.changed` | la organización. **Nunca viaja el catálogo**: el cliente hace un pull autenticado |
| `plugin.#` | `plugins.changed` | la organización dueña del evento |
| `identity.#` | `permissions.changed` | cada usuario afectado, en su sala |
| `billing.invoice.#` | `notification` | el usuario, si tiene el canal `app` activo |
| `fiscal.ec.invoice.attention_required` | `notification` | el usuario, si tiene el canal `app` activo |
| `organization.billing_point.unlinked` | `pos.unlink` | `device:<deviceId>`: el POS se desvincula solo, sin esperar al admin |

Dos detalles de diseño:

- **El canal `app` se consulta a notification-service** (`notification-gate.ts`) antes de emitir: si el usuario apagó la campana para ese proveedor, no le llega. Sin ese gate solo se reenvía `permissions.changed`.
- **`permissions.changed` avisa, pero no arregla el token.** El `pv` del JWT queda viejo y el gateway responderá `401 TOKEN_STALE` hasta que el cliente vuelva a autenticarse; el evento sirve para que el frontend refresque su store al instante en vez de descubrirlo con un error.

## El socket del asistente

`registerAssistantSocket` cuelga del mismo `io` los turnos del [asistente de IA](./asistente-ia.md): las respuestas largas van por WebSocket para no chocar con el buffer y los tiempos de Cloudflare, con HTTP como plan B.

## Lo que se diseñó y no se hizo

Del diseño original se descartaron (o quedaron para más adelante): el chat entre usuarios, el adaptador de Redis para escalar a varias réplicas y los namespaces separados. Hoy el gateway corre en una réplica y el hub reparte en memoria; **escalar el gateway a más de una réplica exige resolver esto primero**.
