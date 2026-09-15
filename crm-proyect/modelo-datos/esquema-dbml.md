# Esquema de base de datos (DBML)

[← Volver al índice](../README.md) · [relaciones globales](./relaciones-globales.md)

Esquema completo del CRM en **DBML**, basado en este vault y en los servicios construidos. **Base de datos por servicio** → cada servicio es un `schema` en el diagrama. Las referencias **dentro** de un servicio son FK reales; las que **cruzan** servicios son lógicas (por ID, sin FK) y van al final, separadas.

**Cómo verlo:** copia el bloque DBML y pégalo en <https://dbdiagram.io>.

> ⚠️ **Desfasado respecto al código (revisado el 2026-09-14).** El DBML de abajo sigue siendo útil como panorama, pero le faltan servicios enteros y `realtime` no existe. Bases **reales** hoy:
>
> | Base | Tablas principales |
> |---|---|
> | `auth_db` | users, credentials, oauth_accounts, refresh_tokens, **device_refresh_tokens**, password_reset_tokens, roles, permissions, role_permissions, user_roles, **user_establishments**, organizations (read-model), organization_memberships, **trusted_ips**, **pos_devices** |
> | `organization_db` | organizations (con `settings` JSON: perfil fiscal RIMPE/contribuyente especial), establishments, emission_points, countries, organization_countries |
> | `customer_db` | customers, contacts, addresses, tags, customer_tags, identification_types |
> | `product_db` | products, categories, units, product_taxes, **product_images**, product_establishments, tax_rates |
> | `tax_db` | countries, tax_rates, identification_types, document_types |
> | `billing_db` | invoices, líneas, impuestos, **sequences** |
> | **`fiscal_ec_db`** | **fiscal_invoices, certificates** (ver [fiscal-ecuador](../servicios/fiscal-ecuador.md)) |
> | `document_db` | file_references |
> | **`notification_db`** | notifications, notification_preferences |
> | **`plugin_catalog_db`** | plugins, plugin_dependencies, plugin_translations, organization_plugins, plugin_custom_requests, business_profiles (+ tablas de perfil) |
> | **`audit_db`** | audit_logs |
> | **`assistant_db`** | conversations, messages, pending_actions, usage_counters |
> | **`inventory_db`** | warehouses, stock_positions, stock_layers, stock_movements, reservations, inventory_gaps, products (read-model), organization_plugins |
>
> Todas llevan además `outbox_messages` y/o `processed_events`. **`realtime_db` no existe**: no hay realtime-service. El api-gateway sigue sin base.
>
> Vista narrada de las relaciones cruzadas: [relaciones globales](./relaciones-globales.md).

```dbml
// =====================================================================
//  CRM + Facturación Electrónica — Microservicios (DB por servicio)
//  schema = servicio · refs intra-servicio = FK · refs cross-servicio = lógicas
// =====================================================================

// =========================== auth-service (auth_db) ==================
// Identidad + acceso (RBAC). Fuente de verdad de usuarios/roles/permisos.

Table auth.users {
  id char(36) [pk]
  email varchar(255) [unique, not null]
  full_name varchar(255)
  identification_type varchar(20) [note: 'cedula|ruc|passport|dni']
  identification_number varchar(30)
  avatar_file_id char(36) [note: 'ref → document (foto de perfil, opcional)']
  status varchar(20) [not null, default: 'active', note: 'active|disabled']
  is_platform_admin boolean [not null, default: false]
  permissions_version int [not null, default: 0, note: 'pv · revocación']
  created_at datetime
  updated_at datetime
  indexes {
    (identification_type, identification_number) [unique]
  }
}

Table auth.credentials {
  id char(36) [pk]
  user_id char(36) [not null]
  email varchar(255) [unique, not null]
  password_hash varchar(255) [note: 'null si cuenta solo-Google']
  email_verified boolean [not null, default: false]
  status varchar(20) [not null, default: 'active', note: 'active|locked|disabled']
  created_at datetime
  updated_at datetime
}

Table auth.oauth_accounts {
  id char(36) [pk]
  credential_id char(36) [not null]
  provider varchar(20) [not null, note: 'google']
  provider_user_id varchar(255) [not null]
  email varchar(255)
  created_at datetime
  indexes {
    (provider, provider_user_id) [unique]
  }
}

Table auth.refresh_tokens {
  id char(36) [pk]
  credential_id char(36) [not null]
  token_hash varchar(255) [unique, not null]
  expires_at datetime [not null]
  revoked_at datetime [note: 'null si activo']
  replaced_by char(36) [note: 'rotación']
  user_agent varchar(255)
  ip varchar(64)
  created_at datetime
}

Table auth.roles {
  id char(36) [pk]
  organization_id char(36) [note: 'null = plantilla global']
  name varchar(100) [not null]
  description varchar(255)
  is_system boolean [not null, default: false]
  created_at datetime
  updated_at datetime
  indexes {
    (organization_id, name) [unique]
  }
}

Table auth.permissions {
  id char(36) [pk]
  code varchar(100) [unique, not null, note: 'recurso:accion']
  resource varchar(50) [not null]
  action varchar(50) [not null]
  description varchar(255)
}

Table auth.role_permissions {
  role_id char(36) [not null]
  permission_id char(36) [not null]
  indexes {
    (role_id, permission_id) [pk]
  }
}

Table auth.user_roles {
  id char(36) [pk]
  user_id char(36) [not null]
  organization_id char(36) [not null, note: 'el rol aplica en esta org']
  role_id char(36) [not null]
  created_at datetime
  indexes {
    (user_id, organization_id, role_id) [unique]
  }
}

Table auth.organization_memberships {
  id char(36) [pk]
  user_id char(36) [not null]
  organization_id char(36) [not null, note: 'ref lógica → organization']
  status varchar(20) [not null, default: 'active', note: 'active|invited|disabled']
  created_at datetime
  updated_at datetime
  indexes {
    (user_id, organization_id) [unique]
  }
}

Table auth.organizations {
  id char(36) [pk, note: '= organization_id · READ-MODEL mínimo']
  country_code varchar(2) [note: 'para el token; se actualiza por org.updated']
  created_at datetime
  updated_at datetime
}

Table auth.outbox_messages {
  id char(36) [pk]
  aggregate_type varchar(50)
  aggregate_id char(36)
  type varchar(100)
  payload json
  occurred_at datetime
  processed_at datetime
}

// ==================== organization-service (organization_db) =========
// Perfil fiscal + estructura. El id = organization_id que genera auth.

Table organization.organizations {
  id char(36) [pk, note: '= organization_id (lo genera auth)']
  legal_name varchar(255) [note: 'null hasta completar perfil']
  trade_name varchar(255)
  tax_id varchar(20) [note: 'RUC/RFC/NIT']
  country_code varchar(2)
  status varchar(20) [not null, default: 'active', note: 'active|suspended']
  settings json
  created_at datetime
  updated_at datetime
  indexes {
    (country_code, tax_id) [unique]
  }
}

Table organization.establishments {
  id char(36) [pk]
  organization_id char(36) [not null]
  code varchar(3) [not null, note: '001, 002...']
  name varchar(255) [not null]
  country_code varchar(2) [not null]
  address varchar(255)
  is_main boolean [not null, default: false]
  status varchar(20) [not null, default: 'active']
  created_at datetime
  updated_at datetime
  indexes {
    (organization_id, code) [unique]
  }
}

Table organization.emission_points {
  id char(36) [pk]
  establishment_id char(36) [not null]
  organization_id char(36) [not null]
  code varchar(3) [not null, note: '001, 002...']
  name varchar(255)
  status varchar(20) [not null, default: 'active']
  created_at datetime
  updated_at datetime
  indexes {
    (establishment_id, code) [unique]
  }
}

Table organization.organization_countries {
  id char(36) [pk]
  organization_id char(36) [not null]
  country_code varchar(2) [not null]
  enabled boolean [not null, default: true]
  indexes {
    (organization_id, country_code) [unique]
  }
}

Table organization.countries {
  code varchar(2) [pk, note: 'READ-MODEL de tax']
  name varchar(100)
  currency_code varchar(3)
  enabled boolean [not null, default: false]
  updated_at datetime
}

Table organization.outbox_messages {
  id char(36) [pk]
  aggregate_type varchar(50)
  aggregate_id char(36)
  type varchar(100)
  payload json
  occurred_at datetime
  processed_at datetime
}

Table organization.processed_events {
  event_id char(36) [pk]
  processed_at datetime
}

// ======================= customer-service (customer_db) ==============
// Clientes del CRM (diseño vault).

Table customer.customers {
  id char(36) [pk]
  organization_id char(36) [not null, note: 'aislamiento']
  country_code varchar(2) [not null]
  identification_type_id char(36) [note: 'ref → read-model local']
  identification varchar(30)
  business_name varchar(255)
  trade_name varchar(255)
  email varchar(255)
  phone varchar(30)
  type varchar(20) [note: 'person|company']
  status varchar(20) [default: 'active', note: 'active|inactive']
  metadata json
  created_at datetime
  updated_at datetime
}

Table customer.contacts {
  id char(36) [pk]
  customer_id char(36) [not null]
  name varchar(255)
  email varchar(255)
  phone varchar(30)
  position varchar(100)
}

Table customer.addresses {
  id char(36) [pk]
  customer_id char(36) [not null]
  type varchar(20) [note: 'billing|shipping']
  line1 varchar(255)
  city varchar(100)
  province varchar(100)
  country_code varchar(2)
  is_primary boolean [default: false]
}

Table customer.tags {
  id char(36) [pk]
  organization_id char(36) [not null]
  name varchar(100)
  color varchar(20)
}

Table customer.customer_tags {
  customer_id char(36) [not null]
  tag_id char(36) [not null]
  indexes {
    (customer_id, tag_id) [pk]
  }
}

Table customer.identification_types {
  id char(36) [pk, note: 'READ-MODEL de tax']
  country_code varchar(2)
  code varchar(20)
  name varchar(100)
}

Table customer.outbox_messages {
  id char(36) [pk]
  aggregate_type varchar(50)
  aggregate_id char(36)
  type varchar(100)
  payload json
  occurred_at datetime
  processed_at datetime
}

// ============================ tax-service (tax_db) ===================
// Catálogo fiscal por país (fuente de verdad). Diseño vault.

Table tax.countries {
  code varchar(2) [pk, note: 'EC, PE, CO, MX']
  name varchar(100)
  currency_code varchar(3)
  decimals int [default: 2]
  enabled boolean [not null, default: true]
}

Table tax.tax_rates {
  id char(36) [pk]
  country_code varchar(2) [not null]
  code varchar(20) [note: 'IVA0, IVA15...']
  name varchar(100)
  percentage decimal
  kind varchar(20) [note: 'vat|withholding|...']
}

Table tax.identification_types {
  id char(36) [pk]
  country_code varchar(2) [not null]
  code varchar(20) [note: 'ec_ruc, ec_cedula, mx_rfc...']
  name varchar(100)
  regex varchar(255)
}

Table tax.document_types {
  id char(36) [pk]
  country_code varchar(2) [not null]
  code varchar(20) [note: 'factura, nota_credito...']
  name varchar(100)
}

// ========================= product-service (product_db) ==============
// Productos/servicios. Implementado en backend/product-service.

Table product.categories {
  id char(36) [pk]
  organization_id char(36) [not null]
  name varchar(150)
  parent_id char(36) [note: 'jerarquía opcional']
  indexes {
    (organization_id, name) [unique]
  }
}

Table product.units {
  id char(36) [pk]
  organization_id char(36) [not null]
  code varchar(20) [note: 'UND, KG, HORA']
  name varchar(100)
  indexes {
    (organization_id, code) [unique]
  }
}

Table product.products {
  id char(36) [pk]
  organization_id char(36) [not null, note: 'aislamiento']
  category_id char(36) [note: 'ref → product.categories']
  unit_id char(36) [note: 'ref → product.units']
  sku varchar(60)
  name varchar(255) [not null]
  description text
  type varchar(20) [note: 'good|service']
  price_cents bigint [not null, default: 0, note: 'centavos · Dinero.js · base sin impuesto']
  currency_code char(3) [not null, default: 'USD', note: 'ISO 4217']
  price_includes_tax boolean [default: false]
  status varchar(20) [default: 'active']
  track_stock boolean [default: false, note: 'fase 2; service ⇒ false']
  created_at datetime
  updated_at datetime
  indexes {
    (organization_id, sku) [unique]
    (organization_id, status)
  }
}

// Impuestos por producto: relación múltiple (IVA + retención, etc.).
Table product.product_taxes {
  id char(36) [pk]
  product_id char(36) [not null, note: 'ref → product.products']
  tax_rate_id char(36) [note: 'ref → tax (read-model local)']
  kind varchar(30) [note: 'denormalizado de la tasa: vat|withholding_iva|...']
  indexes {
    (product_id, tax_rate_id) [unique]
  }
}

// Imágenes del producto: referencia al files-service (crm-minio), no binarios (v2).
Table product.product_images {
  id char(36) [pk]
  product_id char(36) [not null]
  organization_id char(36) [not null, note: 'denormalizado para aislar']
  file_id char(36) [not null, note: 'ref → files-service (crm-minio) · el front arma la URL']
  alt varchar(255)
  is_primary boolean [not null, default: false]
  position int [not null, default: 0]
  created_at datetime
  indexes {
    (product_id, file_id) [unique]
    (product_id, is_primary)
  }
}

Table product.tax_rates {
  id char(36) [pk, note: 'READ-MODEL de tax']
  country_code char(2) [not null]
  code varchar(20) [not null]
  name varchar(100)
  percentage decimal(6,2) [not null, note: 'porcentaje, NO centavos']
  kind varchar(30) [not null]
  is_default boolean [default: false]
  indexes {
    (country_code, code) [unique]
  }
}

Table product.outbox_messages {
  id char(36) [pk]
  aggregate_type varchar(50)
  aggregate_id char(36)
  type varchar(100)
  payload json
  occurred_at datetime
  processed_at datetime
}

Table product.processed_events {
  event_id char(36) [pk]
  processed_at datetime
}

// ========================= billing-service (billing_db) ==============
// Facturación electrónica (diseño vault). Aislamiento por organization_id.

Table billing.invoices {
  id char(36) [pk]
  organization_id char(36) [not null, note: 'aislamiento · entidad legal emisora']
  country_code varchar(2) [not null, note: 'estrategia fiscal']
  establishment_id char(36) [note: 'ref → organization']
  emission_point_id char(36) [note: 'ref → organization']
  customer_id char(36) [note: 'ref → customer']
  sequential varchar(30) [note: '001-001-000000001']
  status varchar(20) [note: 'draft|issued|authorized|voided']
  issue_date datetime
  subtotal_cents bigint [note: 'centavos · Dinero.js']
  tax_total_cents bigint [note: 'centavos']
  total_cents bigint [note: 'centavos']
  currency_code char(3) [note: 'ISO 4217']
  created_at datetime
  updated_at datetime
}

Table billing.invoice_lines {
  id char(36) [pk]
  invoice_id char(36) [not null]
  product_id char(36) [note: 'ref → product']
  description varchar(255)
  quantity decimal [note: 'cantidad, no dinero']
  unit_price_cents bigint [note: 'centavos · snapshot del producto']
  tax_rate_id char(36) [note: 'ref → tax']
  subtotal_cents bigint [note: 'centavos']
}

Table billing.sequences {
  id char(36) [pk]
  organization_id char(36) [not null]
  emission_point_id char(36) [not null, note: 'ref → organization']
  document_type varchar(20)
  current_number bigint [default: 0]
  indexes {
    (organization_id, emission_point_id, document_type) [unique]
  }
}

Table billing.outbox_messages {
  id char(36) [pk]
  aggregate_type varchar(50)
  aggregate_id char(36)
  type varchar(100)
  payload json
  occurred_at datetime
  processed_at datetime
}

// ======================== document-service (document_db) =============

Table document.documents {
  id char(36) [pk]
  organization_id char(36) [not null, note: 'aislamiento']
  owner_id char(36) [note: 'ref → auth.users']
  entity_type varchar(50) [note: 'invoice|customer|...']
  entity_id char(36)
  kind varchar(20) [note: 'pdf|xml|attachment']
  storage_key varchar(512)
  mime varchar(100)
  size_bytes bigint
  created_at datetime
}

// =====================================================================
//  REFERENCIAS INTRA-SERVICIO (FK reales)
// =====================================================================

Ref: auth.credentials.user_id > auth.users.id
Ref: auth.oauth_accounts.credential_id > auth.credentials.id
Ref: auth.refresh_tokens.credential_id > auth.credentials.id
Ref: auth.role_permissions.role_id > auth.roles.id
Ref: auth.role_permissions.permission_id > auth.permissions.id
Ref: auth.user_roles.user_id > auth.users.id
Ref: auth.user_roles.role_id > auth.roles.id
Ref: auth.organization_memberships.user_id > auth.users.id

Ref: organization.establishments.organization_id > organization.organizations.id
Ref: organization.emission_points.establishment_id > organization.establishments.id
Ref: organization.emission_points.organization_id > organization.organizations.id
Ref: organization.organization_countries.organization_id > organization.organizations.id

Ref: customer.contacts.customer_id > customer.customers.id
Ref: customer.addresses.customer_id > customer.customers.id
Ref: customer.customer_tags.customer_id > customer.customers.id
Ref: customer.customer_tags.tag_id > customer.tags.id
Ref: customer.customers.identification_type_id > customer.identification_types.id

Ref: tax.tax_rates.country_code > tax.countries.code
Ref: tax.identification_types.country_code > tax.countries.code
Ref: tax.document_types.country_code > tax.countries.code

Ref: product.products.category_id > product.categories.id
Ref: product.products.unit_id > product.units.id
Ref: product.categories.parent_id > product.categories.id
Ref: product.product_taxes.product_id > product.products.id
Ref: product.product_images.product_id > product.products.id

Ref: billing.invoice_lines.invoice_id > billing.invoices.id

// =====================================================================
//  REFERENCIAS LÓGICAS ENTRE SERVICIOS (por ID, SIN FK real)
//  El aislamiento de todo el sistema es organization_id.
// =====================================================================

// La organización comparte id entre auth (read-model) y organization (dueño)
Ref: auth.organizations.id - organization.organizations.id

// organization_id → organization.organizations.id
Ref: auth.roles.organization_id > organization.organizations.id
Ref: auth.user_roles.organization_id > organization.organizations.id
Ref: auth.organization_memberships.organization_id > organization.organizations.id
Ref: customer.customers.organization_id > organization.organizations.id
Ref: customer.tags.organization_id > organization.organizations.id
Ref: product.products.organization_id > organization.organizations.id
Ref: product.categories.organization_id > organization.organizations.id
Ref: billing.invoices.organization_id > organization.organizations.id
Ref: billing.sequences.organization_id > organization.organizations.id
Ref: billing.sequences.emission_point_id > organization.emission_points.id
Ref: document.documents.organization_id > organization.organizations.id

// billing → estructura y clientes
Ref: billing.invoices.establishment_id > organization.establishments.id
Ref: billing.invoices.emission_point_id > organization.emission_points.id
Ref: billing.invoices.customer_id > customer.customers.id
Ref: billing.invoice_lines.product_id > product.products.id

// fiscal (tax como fuente de verdad)
Ref: billing.invoices.country_code > tax.countries.code
Ref: billing.invoice_lines.tax_rate_id > tax.tax_rates.id
Ref: product.product_taxes.tax_rate_id > tax.tax_rates.id
Ref: customer.customers.country_code > tax.countries.code

// read-models alimentados por eventos de tax
Ref: organization.countries.code > tax.countries.code
Ref: customer.identification_types.id > tax.identification_types.id
Ref: product.tax_rates.id > tax.tax_rates.id

// identidad
Ref: document.documents.owner_id > auth.users.id
Ref: auth.users.avatar_file_id > document.documents.id

// =====================================================================
//  GRUPOS — secciones visuales por servicio (dbdiagram)
// =====================================================================

TableGroup "auth-service · auth_db" [color: #6366F1] {
  auth.users
  auth.credentials
  auth.oauth_accounts
  auth.refresh_tokens
  auth.roles
  auth.permissions
  auth.role_permissions
  auth.user_roles
  auth.organization_memberships
  auth.organizations
  auth.outbox_messages
}

TableGroup "organization-service · organization_db" [color: #10B981] {
  organization.organizations
  organization.establishments
  organization.emission_points
  organization.organization_countries
  organization.countries
  organization.outbox_messages
  organization.processed_events
}

TableGroup "customer-service · customer_db" [color: #F59E0B] {
  customer.customers
  customer.contacts
  customer.addresses
  customer.tags
  customer.customer_tags
  customer.identification_types
  customer.outbox_messages
}

TableGroup "tax-service · tax_db" [color: #EF4444] {
  tax.countries
  tax.tax_rates
  tax.identification_types
  tax.document_types
}

TableGroup "product-service · product_db" [color: #8B5CF6] {
  product.categories
  product.units
  product.products
  product.product_taxes
  product.product_images
  product.tax_rates
  product.outbox_messages
  product.processed_events
}

TableGroup "billing-service · billing_db" [color: #EC4899] {
  billing.invoices
  billing.invoice_lines
  billing.sequences
  billing.outbox_messages
}

TableGroup "document-service · document_db" [color: #14B8A6] {
  document.documents
}
```
