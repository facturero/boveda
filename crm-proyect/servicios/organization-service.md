# organization-service

[← Volver al índice](../README.md) · [auth-service](./auth-service.md) · [tax-service](./tax-service.md) · [estrategia multipaís](../arquitectura/estrategia-multipais.md)

> **Modelo (multipaís):** la estructura es **organización (entidad legal)** → **establecimiento** → **punto de emisión**. La clave de **aislamiento** es **`organization_id`** (cada entidad legal está atada a **un** país vía `country_code`). Un negocio que opera en varios países crea **una organización por entidad/país**. La consolidación bajo un **grupo (`tenant`)** por encima de la organización es una **evolución futura opcional**, no el modelo actual. El término canónico del punto de emisión es `emission_point` (rutas y eventos conservan `billing_point` por compatibilidad). Fuente: [estrategia multipaís](../arquitectura/estrategia-multipais.md).

## Responsabilidad

Dueño del **perfil fiscal y la estructura** de la organización: sus **datos fiscales** (razón social, RUC, país), **establecimientos** (sucursales) y **puntos de emisión**. La clave de aislamiento transversal es **`organization_id`**.

> **Opción A (importante):** la organización **ya existe** cuando este servicio la toca. `auth-service` genera el `organization_id` y crea al fundador (usuario + rol Administrador) al **registrarse**. organization-service **no crea** la organización ni siembra roles: es dueño de su **perfil**, identificado por el `organization_id` que llega en `X-Organization-Id`. Por eso el "alta" aquí es **`PUT /organizations/me`** (completar el perfil de la org que ya tienes), no un `POST` que genere una nueva.

## Entidades dueñas (`organization_db`)

```mermaid
erDiagram
    ORGANIZATION ||--o{ ESTABLISHMENT : tiene
    ESTABLISHMENT ||--o{ EMISSION_POINT : tiene
    ORGANIZATION ||--o{ ORGANIZATION_COUNTRY : opera_en

    ORGANIZATION {
        uuid id PK "★ = organization_id (lo genera auth) · aislamiento"
        string legal_name "razón social (null hasta completar perfil)"
        string trade_name "nombre comercial (null hasta completar)"
        string tax_id "RUC/RFC/NIT (null hasta completar)"
        string country_code "país (null hasta completar)"
        enum status "active|suspended"
        json settings "branding, prefs de la organización"
    }
    ORGANIZATION_COUNTRY {
        uuid id PK
        uuid organization_id FK
        string country_code "ref → tax-service (caso sucursal extranjera)"
        bool enabled
    }
    ESTABLISHMENT {
        uuid id PK
        uuid organization_id FK "★ aislamiento"
        string code "001 (numerado)"
        string name "Matriz, Sucursal Norte"
        string country_code "país del establecimiento"
        string address
        bool is_main
        enum status "active|inactive"
    }
    EMISSION_POINT {
        uuid id PK
        uuid establishment_id FK
        uuid organization_id "★ aislamiento (denormalizado)"
        string code "001 (punto de emisión)"
        string name "Caja 1 · serie (PE) · prefijo (CO)"
        enum status "active|inactive"
    }
```

## Por qué los establecimientos y puntos de emisión importan tanto

En la facturación electrónica de LATAM (Ecuador como referencia), el número de comprobante tiene la forma:

```
   001    -    001    -   000000001
   ▲            ▲             ▲
establecimiento  punto       secuencial
   (code)      de emisión   (lo lleva billing)
```

- El **establecimiento** (`ESTABLISHMENT.code`, ej. `001`) = sucursal física.
- El **punto de emisión** (`EMISSION_POINT.code`, ej. `001`) = caja/terminal de emisión (≈ *serie* en PE, *prefijo* en CO).
- El **secuencial** lo asigna [billing-service](./billing-service.md), no este servicio (garantiza atomicidad y secuencias sin huecos).

**El formato exacto varía por país** (ver [estrategia multipaís](../arquitectura/estrategia-multipais.md#numeración-por-país)); este servicio aporta los **códigos numerados** (`001`, `002`…) y [billing-service](./billing-service.md) los **consume** vía **evento** + read-model para numerar.

```mermaid
sequenceDiagram
    participant O as organization-service
    participant MQ as RabbitMQ
    participant B as billing-service
    O->>MQ: organization.billing_point.created {id, code, establishmentCode, country}
    MQ->>B: consume
    B->>B: registra punto válido + inicializa contador de secuencial
```

## Relación con el país (multipaís)

- La **entidad legal** (`ORGANIZATION`) pertenece a **un solo país** (`country_code`); su `tax_id` es nacional (RUC/NIT/RFC). Un negocio que factura en varios países crea **una organización por país**; la consolidación bajo un **grupo** es evolución futura.
- Cada **establecimiento** hereda el `country_code` de su entidad legal.
- El `country_code` referencia el catálogo de [tax-service](./tax-service.md), que provee IVA, identificaciones, comprobantes, **moneda** y **redondeo** de ese país.
- `ORGANIZATION_COUNTRY` queda para el caso **excepcional** de sucursal de sociedad extranjera registrada localmente; no es la norma.

Detalle del modelo en [estrategia multipaís](../arquitectura/estrategia-multipais.md) y los dos ejes en [multiorganizacional](../arquitectura/multiorganizacional.md#eje-2--multipaís-configuración-fiscal).

## Flujo: onboarding fiscal (Opción A)

La organización y el rol Administrador del fundador ya los creó **auth** en el registro. Aquí el usuario **completa el perfil fiscal** de su organización (misma `organization_id`), y en esa primera vez se aprovisionan el establecimiento matriz y el punto de emisión.

```mermaid
sequenceDiagram
    participant U as SPA
    participant O as organization-service
    participant MQ as RabbitMQ
    participant A as auth-service
    participant B as billing-service

    Note over U,A: (previo) register en auth → user + org (id) + rol Administrador
    U->>O: PUT /organizations/me {legalName, taxId, countryCode}  (X-Organization-Id)
    O->>O: valida país habilitado + formato de RUC; fija perfil
    O->>O: 1.ª vez → crea establecimiento 001 (matriz) + punto de emisión 001
    O->>MQ: organization.org.updated
    O->>MQ: organization.establishment.created
    O->>MQ: organization.billing_point.created
    MQ->>A: actualiza country_code del read-model (para el token)
    MQ->>B: inicializa el secuencial del punto
```

organization-service **no emite `organization.org.created`** (auth ya creó la org). El establecimiento matriz (`001`) y el punto (`001`) se crean en la primera completación del perfil, para poder facturar de inmediato.

## API REST

Verificado contra `src/interface/http/routes.ts` el 2026-09-16.

| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/organizations/me` | `organization:read` |
| PUT | `/organizations/me` | `organization:admin` (completar/actualizar perfil fiscal) |
| PATCH | `/organizations/me` | `organization:admin` (nombre/settings) |
| GET | `/organizations/me/countries` | `organization:read` |
| POST | `/organizations/me/countries` | `organization:admin` |
| GET | `/establishments` | `establishment:read` |
| POST | `/establishments` | `establishment:create` |
| PATCH | `/establishments/:id` | `establishment:update` |
| GET | `/establishments/:id/billing-points` | `establishment:read` |
| POST | `/establishments/:id/billing-points` | `establishment:create` |
| GET | `/establishments/:id/billing-points/:pointId/pairing-code` | `establishment:read` |
| POST | `/establishments/:id/billing-points/:pointId/unlink` | `establishment:update` |
| POST | `/billing-points/pair` | **público** (el código TOTP es la autenticación) |

El permiso de escritura sobre la organización es **`organization:admin`**, no `organization:update`.

## Eventos

**Publica** (verificado 2026-09-16):

| Evento | Cuándo | Lo consume |
|--------|--------|---------------|
| `organization.org.updated` | Perfil fiscal completado/actualizado (`PUT` o `PATCH`) | [auth](./auth-service.md) (country_code del token), [customer](./customer-service.md), [inventory](./inventory-service.md) |
| `organization.establishment.created` | Nuevo establecimiento (también el `001` del alta) | [inventory](./inventory-service.md) (crea la bodega) |
| `organization.establishment.updated` | Edición de un establecimiento | audit |
| `organization.billing_point.created` | Nuevo punto de emisión (también el `001` del alta) | gateway (hub) |
| `organization.billing_point.paired` / `.unlinked` | Emparejar o desvincular un POS | gateway (hub → `pos.unlink` a `device:<id>`) |
| `organization.country.added` | `POST /organizations/me/countries` | audit |

No existe `organization.billing_point.disabled`.

⚠️ **billing-service no consume ninguno de estos eventos** (el diagrama de arriba es el diseño): pide establecimiento, punto de emisión y perfil del emisor por HTTP al emitir, y el secuencial se crea en billing la primera vez que se usa el punto.

**Consume:** nada.

## Dependencias

- **Catálogo de países:** los países habilitados están en una tabla **local** `countries`, sembrada por la migración `20260703150001-seed-countries.js`. **No se sincroniza con tax-service** (no hay consumidor de `tax.country.enabled`): habilitar un país nuevo en tax-service no lo habilita aquí.
- **auth-service**: crea la organización (id) + Administrador en el registro; **consume** `organization.org.updated` para el `country_code` del token. organization-service lo llama por HTTP (`POST /internal/device-accounts`) al emparejar un POS.
- **billing-service** y **fiscal-ecuador**: le piden por HTTP el perfil del emisor, establecimientos y puntos de emisión.

## Validaciones (ver [validación](../arquitectura/validacion.md))

- **Borde (Zod)**: `country_code` ISO válido, `code` de establecimiento/punto con formato (3 dígitos), `tax_id` con formato del país.
- **Dominio**: el `country_code` debe estar habilitado en la tabla local `countries` (no se consulta a [tax-service](./tax-service.md)); el RUC/RFC/NIT matriz se valida con la estrategia del país; los `code` de establecimiento/punto son únicos dentro de su ámbito; no desactivar el establecimiento matriz.

## Lo que se añadió después del diseño (verificado 2026-09-14)

### Puntos de emisión tipo POS y emparejamiento

Un punto de emisión puede ser un **terminal POS**. Al crearlo se genera un secreto **TOTP**; el admin ve un código de 6 dígitos rotando y lo teclea en el equipo sin configurar.

| Ruta | Nota |
|---|---|
| `POST /billing-points/pair` | **público**, sin JWT: el código TOTP *es* la autenticación. Rate limit de 5/min en el gateway |
| `GET /establishments/:id/billing-points` | listado |
| `GET /establishments/:id/billing-points/:pointId/pairing-code` | ver el código |
| `POST /establishments/:id/billing-points/:pointId/unlink` | desvincular y regenerar el secreto |

Reglas del dominio: el emparejamiento es **de un solo uso** (`EmissionPoint.markPaired` / `unlinkAndRegenerate`), y `pair` valida el código contra **todos** los puntos POS sin emparejar de **cualquier** organización, porque todavía no sabe a cuál pertenece el equipo. Si acierta, llama a auth-service (`POST /internal/device-accounts`, secreto interno) para crear el usuario de servicio del equipo.

Eventos: `organization.billing_point.created`, `.paired`, `.unlinked`. El último viaja por el socket como `pos.unlink` a la sala `device:<deviceId>`, así el POS se desvincula solo. Ver [POS](../pos/punto-de-venta.md).

### `settings`: el perfil fiscal de la organización

`organizations.settings` es un **JSON libre** (`Record<string, unknown>`), y ahí viven los datos fiscales que el emisor necesita declarar, editables en Ajustes → Organización:

- régimen **RIMPE**, **contribuyente especial**, **agente de retención**;
- dirección de la **matriz**;
- **forma de pago** por defecto (Tabla 24 del SRI).

[fiscal-ecuador](./fiscal-ecuador.md) los lee al emitir y los vuelca en el XML. Que sea JSON libre es la razón de que añadir todo esto **no exigiera ningún cambio en organization-service**.

### Países de la organización

`organization_countries` y `GET/POST /organizations/me/countries`: una organización puede operar en más de un país. Evento `organization.country.added`.

## Evolución multipaís

Esta es la pieza estructural de la [estrategia multipaís](../arquitectura/estrategia-multipais.md). Decisiones:

| Tema | Decisión | Por qué |
|------|----------|---------|
| Aislamiento | **`organization_id`** (la entidad legal es la unidad de aislamiento) | Es lo que usan el gateway y el resto de servicios; simple y consistente |
| Multipaís fiscal | `country_code` por organización/establecimiento | Parametriza impuestos sin condicionales en el core |
| Varios países | **Una organización por país** | Un RUC es de un solo país; no existe entidad válida en dos países a la vez |
| Grupo/consolidación | **Evolución futura** (`tenant` sobre `organization`) | Solo si un cliente necesita consolidar varias entidades/países; no es el modelo actual |
| `billing_point` → `emission_point` | Renombre canónico | Mapea a *serie* (PE) y *prefijo* (CO); rutas/eventos conservan el nombre viejo por contrato |

- **Una entidad legal = un país.** Para facturar en otro país se crea **otra organización** (otra entidad legal).
- **Onboarding (Opción A)**: auth crea la `organization` (id) + admin en el registro; org-service completa el perfil con `PUT /organizations/me` y aprovisiona establecimiento `001` + punto `001`.
- **Compatibilidad**: el evento `organization.billing_point.created` y la ruta `/establishments/:id/billing-points` conservan el término `billing_point`; conceptualmente son el punto de emisión.
- **Futuro (grupo):** si se añade la capa `tenant`, sería un nivel por encima de `organization` con su propio id; el aislamiento podría subir a `tenant_id` en ese momento (migración acotada). Hoy **no** se implementa.

## Notas

- `settings` (JSON) guarda branding y preferencias **por organización** (logo, plantillas de correo) — base para personalización futura.
- Este servicio es deliberadamente "estructural": no factura ni gestiona clientes; solo define el árbol organización → establecimiento → punto.
