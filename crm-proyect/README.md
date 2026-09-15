# CRM Multiorganizacional — Análisis de Arquitectura

> Documentación de análisis y diseño. **Solo análisis**: aquí no hay código de implementación, sino la definición de cada servicio, sus entidades, cómo se asocian entre sí y los contratos (REST + eventos) que los conectan.

## 🎯 Qué es este proyecto

Una plataforma tipo **CRM + facturación electrónica**, construida con **microservicios**, **multiorganizacional** (multitenant) y **multipaís** (cada país tiene su propia tabla de IVA, tipos de identificación y comprobantes).

### Stack objetivo

| Capa | Tecnología |
|------|------------|
| Frontend | Vue 3 (Composition API), Vuetify 3, Pinia, Axios, Vue Router, socket.io-client |
| Backend | Node.js, Hono.js, TypeScript, **Clean Architecture**, Sequelize |
| Validación | Zod (back + esquemas compartidos), reglas Vuetify + Zod (front) |
| Mensajería | RabbitMQ (eventos entre servicios, patrón Outbox) |
| Tiempo real | Socket.IO **dentro del api-gateway** (`/ws`). Sin adaptador de Redis: una sola réplica |
| Datos | MySQL 9 (una base por servicio), MinIO (archivos). **Sin Redis**: las cachés del gateway son en memoria |
| Infra | Docker, **k3s** de un nodo + Traefik + cloudflared, **GitHub Actions** (build a ghcr.io + `kubectl apply`), SOPS + age para secretos |

## 🗺️ Mapa de la documentación

### Arquitectura (transversal)

- [Visión general](./arquitectura/vision-general.md) — contexto, principios, diagrama de alto nivel
- [Descomposición en microservicios](./arquitectura/microservicios.md) — límites, ownership de datos, tabla de servicios
- [Comunicación entre servicios](./arquitectura/comunicacion.md) — REST síncrono + RabbitMQ asíncrono, Outbox, Saga
- [Multiorganizacional + multipaís](./arquitectura/multiorganizacional.md) — estrategia de tenancy y configuración por país
- [Estrategia multipaís](./arquitectura/estrategia-multipais.md) — núcleo invariante + plug-ins por país, estructura organización → establecimiento → punto de emisión, numeración, qué construir ahora vs. después
- [Clean Architecture](./arquitectura/arquitectura-limpia.md) — capas, estructura de carpetas, regla de dependencia
- [Estrategia de validación](./arquitectura/validacion.md) — front + back + esquemas compartidos
- [Tiempo real (Socket.IO)](./arquitectura/tiempo-real.md) — salas por organización y por usuario, auth de sockets. ⚠️ el servicio dedicado que describe no existe: vive en el gateway
- [Despliegue, infraestructura y entorno local](./arquitectura/despliegue-y-entorno.md) — un repo por servicio, GitHub Actions, k3s, el túnel, docker-compose y el sembrador de datos
- [Estrategia de pruebas](./arquitectura/pruebas.md) — las cuatro capas, los principios que se siguen y dónde viven el plan de pruebas y los bugs conocidos
- [Observabilidad](./arquitectura/observabilidad.md) — OpenTelemetry + SigNoz en una máquina aparte; qué está instrumentado y qué no
- [Migraciones](./arquitectura/migraciones.md) — que se ejecuten solas al desplegar y que fallen ruidosamente; semillas idempotentes

### Facturación electrónica (SRI Ecuador)

- [Facturación electrónica](./facturacion-electronica/README.md) — **estado real de lo construido**, flujo end-to-end, reglas del SRI, operación, pendientes e historial de la auditoría

### Servicios

- [auth-service](./servicios/auth-service.md) — **identidad y acceso**: autenticación (JWT, refresh, Google Sign-In, IPs de confianza, terminales POS) + autorización (**usuarios, roles, permisos**, RBAC)
- [organization-service](./servicios/organization-service.md) — **organizaciones (entidades legales), establecimientos, puntos de emisión** (multipaís)
- [customer-service](./servicios/customer-service.md) — **clientes** y contactos
- [product-service](./servicios/product-service.md) — **productos**, categorías, impuestos por producto
- [tax-service](./servicios/tax-service.md) — **catálogos por país**: IVA, tipos de identificación, tipos de comprobante
- [billing-service](./servicios/billing-service.md) — **facturación**, secuenciales, comprobantes electrónicos
- [chat-service](./servicios/chat-service.md) — **mensajería interna** 1-a-1 y grupos entre usuarios de la organización (en construcción)
- [document-service](./servicios/document-service.md) — **archivos adjuntos**, almacenamiento y gestión de documentos (polimórfico)
- [fiscal-ecuador](./servicios/fiscal-ecuador.md) — **SRI Ecuador**: clave de acceso, XML, firma XAdES-BES, envío y autorización, RIDE. Construido y desplegado
- [realtime-service](./servicios/realtime-service.md) — ⚠️ **desfasado**: no existe tal servicio. El socket vive en el api-gateway (`/ws`) y las notificaciones en `notification-service`
- [audit-log-service](./servicios/audit-log-service.md) — **bitácora central de auditoría**: consume todos los eventos (`crm.events`) y expone solo lectura con `audit:read`
- [perfiles de negocio](./servicios/perfiles-de-negocio.md) — **recomendación de plugins por tipo de negocio** (tienda, farmacia…) en plugin-catalog-service, y los dos pasos de alta que la usan
- [asistente de IA](./servicios/asistente-ia.md) — **agente que ejecuta** dentro del CRM (crear un rol, invitar, informes); las herramientas son la propia API, con confirmación humana en toda escritura
- [api-gateway](./servicios/api-gateway.md) — punto único de entrada, routing, propagación de contexto
- [notification-service](./servicios/notification-service.md) — **la campana y el correo**: catálogo de proveedores por plugin, preferencias por canal
- [plugin-catalog-service](./servicios/plugin-catalog-service.md) — **qué módulos existen y cuáles tiene contratados cada organización**; el gateway lo consulta en cada ruta
- [inventory-service](./servicios/inventory-service.md) — bodegas, kardex y costeo (FIFO / promedio). **Construido, sin desplegar**
- [outbox-relay](./servicios/outbox-relay.md) — **librería npm**, no un servicio: outbox del productor, reintentos del consumidor y `ActorContext`

### Punto de venta

- [POS](./pos/punto-de-venta.md) — caja registradora de escritorio (Tauri), offline-first, emparejada con TOTP contra el CRM

### Modelo de datos

- [Relaciones globales](./modelo-datos/relaciones-globales.md) — cómo se asocian las entidades entre servicios (IDs de referencia, diagrama ER global)

### Frontend

- [Arquitectura frontend](./frontend/arquitectura-frontend.md) — estructura Vue/Pinia, manejo de auth/tenant, sockets, validación

## 🧩 Módulos: lo que pediste + lo que recomiendo añadir

> **Estado al 2026-09-14.** Esta sección era la lista original de módulos. Lo construido desde entonces: facturación electrónica con el SRI ([fiscal-ecuador](./servicios/fiscal-ecuador.md)), bitácora de auditoría, notificaciones, catálogo de plugins con perfiles de negocio, asistente de IA, inventario (sin desplegar) y el [POS](./pos/punto-de-venta.md). Siguen sin construirse: pagos y cuentas por cobrar, listas de precios, reportes y el CRM de ventas.

Lo que listaste:

- ✅ Clientes → [customer-service](./servicios/customer-service.md)
- ✅ Roles y permisos → [auth-service](./servicios/auth-service.md)
- ✅ Usuarios → [auth-service](./servicios/auth-service.md)
- ✅ Productos → [product-service](./servicios/product-service.md)
- ✅ Facturación → [billing-service](./servicios/billing-service.md)
- ✅ Establecimientos y puntos de emisión → [organization-service](./servicios/organization-service.md)
- ✅ Auth service → [auth-service](./servicios/auth-service.md)
- ✅ Multiorganizacional + IVA por país → [multiorganizacional](./arquitectura/multiorganizacional.md) + [tax-service](./servicios/tax-service.md)
- ✅ Tiempo real → [api-gateway](./servicios/api-gateway.md) (`/ws`) + [notification-service](./servicios/notification-service.md)
- ✅ Archivos adjuntos (polimórfico) → [document-service](./servicios/document-service.md)
- ✅ Validación front + back → [validación](./arquitectura/validacion.md)

**Qué más debería llevar un CRM + facturación serio** (propuesto, priorizado):

1. **Secuenciales y numeración de comprobantes** — crítico en LATAM (formato `001-001-000000001`). Ya incluido en [billing-service](./servicios/billing-service.md).
2. **Tipos de comprobante** — factura, nota de crédito, nota de débito, comprobante de retención, guía de remisión. Varían por país → [tax-service](./servicios/tax-service.md).
3. ✅ **Integración con autoridad fiscal** — **hecho para Ecuador**: [fiscal-ecuador](./servicios/fiscal-ecuador.md) y [facturación electrónica](./facturacion-electronica/README.md). Los demás países (DIAN, SAT, SUNAT, SII) siguen siendo adaptadores futuros.
4. ✅ **Auditoría / bitácora** — hecho: [audit-log-service](./servicios/audit-log-service.md), que consume `#`.
5. **Pagos y cuentas por cobrar** — registro de pagos, saldos, estados de cuenta del cliente.
6. ⚠️ **Inventario / stock** — [inventory-service](./servicios/inventory-service.md) construido con kardex y costeo FIFO/promedio, **pendiente de desplegar**.
7. **Listas de precios, descuentos y promociones** — precios por organización/cliente/moneda.
8. **Multimoneda** — necesario al ser multipaís.
9. ✅ **Notificaciones** (email + campana) — hecho: [notification-service](./servicios/notification-service.md).
10. **Reportes y dashboard** — ventas, IVA por declarar, top clientes/productos.
11. **CRM "puro" (opcional, fase 2)** — leads, oportunidades, pipeline de ventas, actividades/tareas/recordatorios. Si el foco hoy es facturación, dejarlo para una fase posterior.
12. ✅ **Almacenamiento de documentos** — PDFs/XML de comprobantes, adjuntos (S3/MinIO). Ya incluido en [document-service](./servicios/document-service.md).
13. ⚠️ **Configuración por organización** — parcial: `organizations.settings` guarda el perfil fiscal (RIMPE, contribuyente especial, forma de pago). Falta branding y plantillas de correo.
14. ✅ **Catálogo de módulos por organización** — no estaba en la lista y resultó central: [plugin-catalog-service](./servicios/plugin-catalog-service.md).

> Sugerencia de fases: **Fase 1** (núcleo): auth (identidad y acceso), organization, tax, product, customer, billing, document, realtime, gateway. **Fase 2**: pagos, inventario, listas de precios, reportes. **Fase 3**: CRM de ventas (leads/oportunidades), integraciones fiscales avanzadas.

## ✅ Cobertura: código ↔ documentación

Contrastado pieza por pieza contra el repo de código el **2026-09-14**. Todo lo que hay en el código tiene documento:

| Código | Documento |
|---|---|
| 13 servicios de `backend/` + gateway | una ficha por servicio en [servicios/](./servicios/) |
| `backend/outbox-relay` (librería) | [outbox-relay](./servicios/outbox-relay.md) |
| `backend/{mysql,rabbitmq,minio}-basic`, `backend/k8s` | [despliegue y entorno](./arquitectura/despliegue-y-entorno.md) |
| `backend/*.sh`, `hosttest.mjs` | idem |
| `frontend/` | [arquitectura frontend](./frontend/arquitectura-frontend.md) |
| `frontend/e2e/` + `e2e/docs/TEST-PLAN.md` | [pruebas](./arquitectura/pruebas.md) |
| `pos/` | [POS](./pos/punto-de-venta.md) |
| `observability/` | [observabilidad](./arquitectura/observabilidad.md) |
| `docker-compose.yml`, `docker/`, `.env.example`, `seed/` | [despliegue y entorno](./arquitectura/despliegue-y-entorno.md) |
| workflows de CI de cada repo | idem |
| `FACTURACION-BRECHAS.md` | [facturación electrónica](./facturacion-electronica/README.md) |

Sin documentar a propósito: `.mz-ref/` (capturas de una interfaz de referencia) y `nul` (archivo basura de una redirección de Windows).

## 📐 Convenciones de esta documentación

- **Cada servicio = una base de datos propia.** Nadie lee tablas de otro servicio directamente.
- Las referencias entre servicios se hacen por **ID** (ej. `organizationId`, `customerId`), nunca por JOIN entre bases.
- Todos los datos de negocio están **aislados por `organization_id`** (la entidad legal); `country_code` parametriza las reglas fiscales. La consolidación por grupo (`tenant`) es evolución futura. Ver [estrategia multipaís](./arquitectura/estrategia-multipais.md) y [multiorganizacional](./arquitectura/multiorganizacional.md).
- Los catálogos fiscales están **particionados por `countryCode`** y son datos de plataforma (compartidos entre organizaciones). Ver [tax-service](./servicios/tax-service.md).
- Los eventos de dominio se nombran en pasado: `invoice.issued`, `customer.created`, `user.role_assigned`.
- Los esquemas de validación (Zod) viven en un paquete compartido y se usan en back y front.
