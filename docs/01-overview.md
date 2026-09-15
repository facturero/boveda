# 01 — Visión General y Stack Tecnológico

## Visión del Proyecto

CRM multiorganizacional que permite a distintas empresas (organizaciones) gestionar sus clientes, productos, facturación y operaciones, respetando configuraciones fiscales y regulatorias de cada país.

## Stack Tecnológico

### Frontend

| Tecnología | Uso |
|------------|-----|
| **Vue 3** (Composition API) | Framework base |
| **Vuetify 3** | Sistema de componentes UI (Material Design) |
| **Pinia** | Manejo de estado global |
| **Axios** | Cliente HTTP para consumir APIs |
| **Vue Router** | Enrutamiento del lado del cliente |
| **Zod** (compartido) | Validación de formularios (mismos esquemas que backend) |
| **Socket.IO Client** | Comunicación en tiempo real |

### Backend

| Tecnología | Uso |
|------------|------|
| **Node.js + HonoJS** | Framework web rápido, tipo Express pero moderno |
| **TypeScript** | Tipado estático en toda la base de código |
| **Arquitectura Limpia** | Separación en capas (domain, application, infrastructure) |
| **Sequelize** | ORM para PostgreSQL / MySQL |
| **Zod** | Validación de esquemas y datos de entrada |
| **Socket.IO Server** | Manejo de conexiones WebSocket |
| **JWT** | Autenticación stateless |

### Infraestructura

| Tecnología | Uso |
|------------|------|
| **Docker** | Contenerización de cada microservicio |
| **PostgreSQL** | Base de datos principal (una por servicio) |
| **Redis** | Caché, sesiones, cola de mensajes |
| **Nginx / Traefik** | API Gateway / reverse proxy |
| **GitHub Actions** | CI/CD |

---

## Principios de Diseño

1. **Clean Architecture**: Dependencias hacia adentro (domain no sabe de infraestructura).
2. **API-First**: Los contratos de API se definen antes de implementar.
3. **Event-Driven**: Comunicación asíncrona entre servicios vía eventos.
4. **Tenant Isolation**: Datos completamente aislados por organización.
5. **Country-Aware**: Comportamiento dinámico según el país del tenant.

---

[← Volver al índice](index.md) | [Siguiente: Entidades del CRM →](02-entities.md)
