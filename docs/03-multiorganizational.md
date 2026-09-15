# 03 — Estructura Multiorganizacional

## Concepto

Cada **Organización** es un tenant completamente aislado. Los datos de una organización **nunca** son visibles para otra, a menos que explícitamente se compartan (reportes globales del superadmin del sistema).

## Estrategias de Aislamiento

### 1. Aislamiento por Columna (`organization_id`)

Todas las tablas de negocio incluyen `organization_id` como FK.

```sql
-- Ejemplo en todas las tablas
organization_id UUID NOT NULL REFERENCES organizations(id)
```

Cada query en los repositorios incluye automáticamente:

```typescript
// Middleware a nivel de repositorio
where: { organization_id: currentOrganizationId }
```

### 2. Schema por Organización (PostgreSQL)

Para organizaciones que requieren aislamiento más fuerte, se puede usar un schema por tenant:

```
public.organizations
org_abc123.customers
org_def456.customers
```

Esta estrategia es opcional y se activa por configuración.

## Routing por Organización

Se usa un **subdominio** para identificar la organización:

```
https://miempresa.app.crm.com/api/...
         ^^^^^^^^^^ slug de la organización
```

El API Gateway extrae el slug del subdominio, obtiene el `organization_id` y lo inyecta en el contexto de la request.

## Usuarios Multi-Organización

Un usuario puede tener acceso a múltiples organizaciones (ej: consultor externo) mediante una tabla `user_organization_access`:

| Campo | Tipo |
|-------|------|
| `user_id` | UUID |
| `organization_id` | UUID |
| `role_id` | UUID | Rol dentro de esa organización |

El JWT contiene un array de organizaciones a las que el usuario tiene acceso.

## Permisos por Establecimiento

Además del aislamiento por organización, los permisos pueden limitarse a establecimientos específicos:

- `user_establishment_access` — qué establecimientos puede operar un usuario
- Un cajero solo ve su punto de facturación, no todos los de la empresa

## Configuraciones Heredadas

```
País (reglas fiscales, moneda, IVA)
  └── Organización (personalización de precios, roles)
       └── Establecimiento (horarios, impresoras)
            └── Punto de Facturación (secuencia numérica)
```

---

[← Volver al índice](index.md) | [Anterior: Entidades](02-entities.md) | [Siguiente: Configuración por País →](04-country-config.md)
