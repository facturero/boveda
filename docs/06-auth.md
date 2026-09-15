# 06 — Autenticación y Autorización

## Auth Service (Microservicio independiente)

Servicio dedicado exclusivamente a manejar identidad, autenticación y autorización.

## Flujo de Autenticación

```
Cliente                    API Gateway               Auth Service
  │                            │                         │
  │  POST /auth/login          │                         │
  │  {email, password}         │                         │
  │ ─────────────────────────> │ ──────────────────────> │
  │                            │                         │
  │                            │   Validar credenciales   │
  │                            │   Generar JWT           │
  │                            │ <────────────────────── │
  │  { access_token,           │                         │
  │    refresh_token,          │                         │
  │    user, organization }    │                         │
  │ <───────────────────────── │                         │
```

## JWT — Estructura del Token

```json
{
  "sub": "user-uuid",
  "org_id": "org-uuid",
  "org_slug": "miempresa",
  "country_id": "country-uuid",
  "roles": ["admin", "manager"],
  "permissions": ["customers:read", "customers:write", "invoices:create"],
  "establishments": ["est-uuid-1", "est-uuid-2"],
  "iat": 1719000000,
  "exp": 1719086400
}
```

El JWT contiene toda la información necesaria para que el API Gateway y los microservicios tomen decisiones de autorización **sin llamar al Auth Service**.

## Flujo de Autorización

Cada microservicio utiliza un middleware que:

1. Extrae el JWT del header `Authorization: Bearer <token>`
2. Verifica la firma con la clave pública del Auth Service
3. Extrae `org_id` y lo inyecta en el contexto de la request
4. Verifica que el usuario tenga el permiso necesario para la ruta

```typescript
// Middleware de autorización (HonoJS)
app.use('/api/v1/customers/*', async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  const payload = verifyJWT(token, PUBLIC_KEY);
  
  if (!hasPermission(payload.permissions, 'customers', 'read')) {
    return c.json({ error: 'FORBIDDEN' }, 403);
  }
  
  c.set('user', payload);
  await next();
});
```

## Roles y Permisos

### Tabla de Permisos por Recurso

| Recurso | Acciones |
|---------|----------|
| `customers` | `create`, `read`, `update`, `delete`, `export` |
| `products` | `create`, `read`, `update`, `delete`, `import` |
| `invoices` | `create`, `read`, `update`, `cancel`, `resend` |
| `establishments` | `create`, `read`, `update`, `delete` |
| `users` | `create`, `read`, `update`, `delete` |
| `roles` | `create`, `read`, `update`, `delete` |
| `reports` | `read`, `export` |
| `settings` | `read`, `update` |

### Roles Predefinidos

| Rol | Permisos incluidos |
|-----|-------------------|
| `superadmin` | Todos los permisos sobre todos los recursos |
| `admin` | Todos excepto gestión de usuarios/roles |
| `manager` | CRUD clientes y productos, leer facturas |
| `cashier` | Crear facturas, leer clientes y productos |
| `viewer` | Solo lectura en todos los recursos |

### Permisos por Establecimiento

Los roles pueden estar limitados a establecimientos específicos mediante `user_establishment_access`:

| Usuario | Establecimientos | Rol |
|---------|-----------------|-----|
| Juan Pérez | Sucursal Centro | cashier |
| Juan Pérez | Sucursal Norte | viewer |

## Registro de Usuario

Solo un `superadmin` o `admin` puede crear usuarios dentro de su organización.

```typescript
POST /api/v1/auth/users
{
  "email": "user@company.com",
  "password": "securePass123!",
  "roles": ["cashier"],
  "establishments": ["est-uuid-1"]
}
```

## Endpoints del Auth Service

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/logout` | Cerrar sesión (revocar token) |
| POST | `/auth/refresh` | Renovar access token |
| POST | `/auth/change-password` | Cambiar contraseña |
| POST | `/auth/forgot-password` | Solicitar restablecimiento |
| POST | `/auth/reset-password` | Restablecer contraseña |
| GET | `/auth/me` | Obtener perfil actual |
| POST | `/auth/validate` | Validar token (entre servicios) |

## Refresh Tokens

- **Access token**: 15 minutos de duración
- **Refresh token**: 7 días, almacenado en Redis
- Al refrescar, se rota el refresh token (invalida el anterior)

## Seguridad Adicional

- **bcrypt** para hashing de contraseñas (cost factor 12)
- **Rate limiting** por IP en login (5 intentos, 15 min de bloqueo)
- **2FA** opcional vía TOTP
- **Audit log** de todos los inicios de sesión
- **Invalidación de tokens** ante cambio de rol o contraseña

---

[← Volver al índice](index.md) | [Anterior: Microservicios](05-microservices.md) | [Siguiente: Tiempo Real →](07-realtime.md)
