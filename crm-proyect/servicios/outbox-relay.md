# @facturero/outbox-relay (librería, no servicio)

[← Volver al índice](../README.md) · [comunicación entre servicios](../arquitectura/comunicacion.md) · [audit-log-service](./audit-log-service.md)

> **Esto no se despliega.** Es un paquete npm que cada servicio instala. Fuente en `backend/outbox-relay` del repo de código. Versión actual: **0.2.1**.

## Qué resuelve

Dos problemas que antes estaban resueltos a medias y por separado en cada servicio:

1. **Lado productor (Outbox).** El relay drenaba la tabla `outbox_messages` con un `setInterval` fijo: hasta 5 s de retraso en cada evento. Ahora publica **inmediatamente tras el commit** de la transacción, y la tabla queda como red de seguridad.
2. **Lado consumidor (Inbox).** `channel.nack(msg, false, true)` sin límite: un mensaje envenenado reintentando para siempre, sin escape.

## Requisitos, explícitos a propósito

No pretende ser multi-dialecto: asume la arquitectura que ya usan todos los servicios y lo dice.

- **Sequelize ^6.37.5** y **mysql2 ^3.11.5** como peer dependencies **obligatorias** (usa la instancia que el servicio ya tiene).
- **MySQL 8.0+**: `drain()` usa `FOR UPDATE SKIP LOCKED` y `markOutcome()` usa `ON DUPLICATE KEY UPDATE`. Nada de esto es SQL portable.

## La escalera de reintentos

```
reintentos inmediatos en el mismo proceso
        ↓
cola de espera con TTL (delay antes de reintentar, vía dead-letter-exchange)
        ↓
estado `failed` en la tabla de idempotencia
```

**Por qué el estado final va a la base de datos y no a una dead-letter queue de RabbitMQ:** un `failed` en `processed_events` se puede consultar con SQL junto al resto del dominio, sobrevive al TTL de la cola y no obliga a nadie a entrar al management UI de RabbitMQ.

## El cambio de 0.1.x a 0.2.x (importante)

Hasta 0.1.0 el circuito de retry era **compartido**: un único exchange `${exchange}.retry` al que se bindeaban **todas** las colas con `#`. Consecuencia: un evento que fallara en **un** consumidor se copiaba a las N colas de espera y, al vencer el TTL, se reinyectaba N veces en todos los servicios.

| | 0.1.x | 0.2.x |
|---|---|---|
| Exchange de retry | `${exchange}.retry` (compartido) | `${queue}.retry` (privado) |
| Cola de espera | `${queue}.retry`, bindeada con `#` | `${queue}.retry.wait`, bindeada con `retry` |
| Vuelta del retry | dead-letter a `${exchange}` (a todos) | dead-letter a `${queue}.return` (solo a ese consumidor) |

⚠️ **Paso manual al actualizar:** la cola `<queue>.retry` heredada tiene argumentos incompatibles con la nueva, por eso la de espera pasa a llamarse `<queue>.retry.wait`. Las viejas hay que borrarlas a mano:

```bash
rabbitmqctl list_queues name messages | grep '\.retry$'
rabbitmqctl delete_queue <servicio>.<cola>.retry
```

## ⚠️ La publicación inmediata NO está cableada (verificado 2026-09-14)

El argumento principal de la librería —publicar **en cuanto el commit tiene éxito**, en vez de esperar al temporizador— **no lo usa ningún servicio**.

La API es `attachToTransaction(tx)` (que engancha `tx.afterCommit(() => this.notify())`) o una llamada directa a `relay.notify()`. Buscando en los once servicios que publican: **cero llamadas a `attachToTransaction`, cero a `notify()`**. Todos hacen `await relay.start()` y ahí acaba; varios ni siquiera conservan la referencia al relay, así que no podrían llamarlo.

**Consecuencia:** todos los eventos del sistema salen por el **safety net**, el `setInterval` de `safetyNetIntervalMs` (30 s por defecto). Es decir, entre 0 y 30 s de retraso, al azar, en cada evento de dominio — exactamente el problema que la librería venía a resolver.

Se midió en vivo con el gate de plugins del gateway: activar un plugin tardó **14,4 s** en reflejarse, y una suite de pruebas que sondeaba 20 s falló dos veces (hallazgo #23 del `TEST-PLAN.md`, que lo atribuyó solo a plugin-catalog-service; en realidad les pasa a todos).

**El arreglo** es una línea por caso de uso: enganchar la transacción al relay, o llamar a `relay.notify()` después del COMMIT que escribe en el outbox.

## Handler comodín

`CATCH_ALL_EVENT_TYPE` (`'#'`) atiende lo que no case con ninguna routing key exacta. Es lo que hace posible el [audit-log-service](./audit-log-service.md): consume **todos** los eventos del sistema con un solo handler.

## ActorContext

Propaga **quién** origina la acción, desde la petición HTTP hasta el outbox, con `AsyncLocalStorage`.

El problema: los eventos dicen *qué* pasó y *cuándo*, pero casi nunca *quién*. Arrastrar el `userId` a mano hasta cada `outbox.add()` no ocurre en la práctica, y la bitácora acaba con `user_id`, `ip` y `request_id` en NULL.

La trampa que evita: **reutilizar el `userId` que ya venga en el payload no sirve**, porque en los eventos de identidad ese campo es el usuario *afectado*, no quien ejecuta. Por eso los campos del actor tienen nombre propio (`actorId`, `actorEmail`) y no se mezclan con los del dominio.

## Publicación

GitHub Packages, scope `@facturero`, acceso restringido. **La publicación es manual** (`npm publish` desde `backend/outbox-relay`); no hay workflow que la haga. Los servicios consumidores necesitan un `.npmrc` con `NODE_AUTH_TOKEN`, y sus workflows de CI inyectan ese secreto en el job de build.
