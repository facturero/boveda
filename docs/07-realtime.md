# 07 — Comunicación en Tiempo Real

## Tecnología: Socket.IO

Usamos Socket.IO para toda la comunicación bidireccional en tiempo real.

## Arquitectura

```
Cliente A ──ws──┐                  ┌──ws── Cliente B
                 │                  │
                 ▼                  ▼
          ┌──────────────────────────────┐
          │   Notification Service        │
          │   (Socket.IO Server)          │
          │                               │
          │   Redis Adapter (escalar)     │
          └──────┬───────────────────────┘
                 │
          ┌──────▼───────┐
          │   Redis       │
          │   (pub/sub)   │
          └──────────────┘
```

## Escalabilidad

Con **Redis Adapter**, múltiples instancias del Notification Service pueden compartir eventos:

- Un evento publicado en una instancia se propaga a todas las demás vía Redis Pub/Sub
- Permite tener múltiples pods del servicio detrás de un load balancer

## Conexión y Autenticación

```typescript
// Client-side
const socket = io('wss://app.crm.com/ws', {
  auth: { token: 'jwt-token-here' }
});

// Server-side - verificación
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = verifyJWT(token);
  if (!user) return next(new Error('Unauthorized'));
  
  socket.data.user = user;
  socket.join(`org:${user.org_id}`);        // Sala de organización
  socket.join(`user:${user.sub}`);          // Sala personal
  next();
});
```

## Salas (Rooms)

| Sala | Miembros | Propósito |
|------|----------|-----------|
| `org:{org_id}` | Todos los usuarios de la org | Eventos globales de la organización |
| `user:{user_id}` | Un usuario específico | Notificaciones personales |
| `est:{est_id}` | Usuarios de un establecimiento | Eventos locales del establecimiento |
| `bp:{billing_point_id}` | Cajeros del punto | Notificaciones de facturación |

## Eventos del Sistema

### Eventos de Clientes

| Evento | Sala | Descripción |
|--------|------|-------------|
| `customer.created` | `org:{id}` | Nuevo cliente registrado |
| `customer.updated` | `org:{id}` | Cliente actualizado |
| `customer.deleted` | `org:{id}` | Cliente eliminado |

### Eventos de Facturación

| Evento | Sala | Descripción |
|--------|------|-------------|
| `invoice.issued` | `org:{id}`, `bp:{id}` | Factura emitida |
| `invoice.cancelled` | `org:{id}`, `bp:{id}` | Factura anulada |
| `invoice.updated` | `org:{id}`, `bp:{id}` | Factura modificada |

### Eventos de Productos

| Evento | Sala | Descripción |
|--------|------|-------------|
| `product.updated` | `org:{id}` | Precio o stock actualizado |
| `product.low_stock` | `org:{id}`, `user:{admin_id}` | Stock por debajo del mínimo |

### Eventos de Usuarios

| Evento | Sala | Descripción |
|--------|------|-------------|
| `user.logged_in` | `user:{id}` | Sesión iniciada en otro dispositivo |
| `user.role_changed` | `user:{id}` | Rol modificado (forzar recarga de permisos) |
| `user.kicked` | `user:{id}` | Sesión cerrada por admin |

### Eventos del Sistema

| Evento | Sala | Descripción |
|--------|------|-------------|
| `system.maintenance` | `org:{id}` | Aviso de mantenimiento programado |
| `system.config_updated` | `org:{id}` | Configuración de organización actualizada |

## Implementación en Frontend (Pinia)

```typescript
// Stores/socket.ts
export const useSocketStore = defineStore('socket', () => {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);

  function connect(token: string) {
    socket.value = io(WS_URL, { auth: { token } });
    
    socket.value.on('connect', () => { connected.value = true; });
    socket.value.on('disconnect', () => { connected.value = false; });
    
    // Escuchar eventos globales
    socket.value.on('invoice.issued', (data) => {
      // Actualizar store de facturas
      invoiceStore.addInvoice(data.invoice);
    });
    
    socket.value.on('notification', (data) => {
      notificationStore.add(data);
    });
  }

  function disconnect() {
    socket.value?.disconnect();
  }

  return { socket, connected, connect, disconnect };
});
```

## Notificaciones Push

El Notification Service también maneja notificaciones fuera de línea:

- **Email**: Notificaciones de facturas emitidas, bienvenida, restablecimiento de contraseña
- **SMS**: Alertas críticas (seguridad, pagos)
- **Push**: Notificaciones en el navegador vía Service Worker

## Event Flow Completo

```
1. Cliente A emite factura
2. Billing Service crea Invoice
3. Billing Service emite evento `invoice.issued` en Redis Pub/Sub
4. Notification Service recibe el evento
5. Notification Service emite Socket.IO a sala `org:{id}`
6. Clientes B y C (conectados) reciben actualización en tiempo real
7. Notification Service también envía email al cliente (Customer)
```

---

[← Volver al índice](index.md) | [Anterior: Autenticación](06-auth.md) | [Siguiente: Validación →](08-validation.md)
