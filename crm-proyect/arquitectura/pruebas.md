# Estrategia de pruebas

[← Volver al índice](../README.md) · [validación](./validacion.md) · [despliegue y entornos](./despliegue-y-entorno.md)

> **Inventario real al 2026-09-14**, contado sobre el código. Esta bóveda no tenía nada sobre pruebas y el proyecto tiene bastante: ~94 archivos de test unitario, 15 specs end-to-end y un plan de pruebas de 503 líneas.

## Las cuatro capas

| Capa | Herramienta | Dónde |
|---|---|---|
| **Unitaria** | Vitest (`npm test` en cada servicio) | `src/__tests__/` de cada servicio |
| **Integración** | Vitest contra un **MySQL real** (`npm run test:integration`) | hoy **solo fiscal-ecuador** |
| **End-to-end** | Playwright contra el stack completo | `frontend/e2e/specs/` |
| **Manifiestos** | Vitest sobre los YAML de k8s | `fiscal-ecuador/src/__tests__/k8s-manifests.test.ts` |

### Cobertura unitaria por servicio

| Servicio | Archivos de test |
|---|---|
| auth-service | 17 |
| fiscal-ecuador | 16 |
| document-service | 13 |
| inventory-service, plugin-catalog-service | 8 |
| product-service | 6 |
| assistant-service, billing-service | 5 |
| audit-log-service | 4 |
| customer-service, notification-service, organization-service, tax-service | 3 |
| **api-gateway-node** | **0** |
| **frontend** | **0** (solo e2e) |

⚠️ **El gateway no tiene ni un test**, y es la pieza que decide autenticación, permisos, plugins por ruta y el **borrado de cabeceras de suplantación**. Justo ahí estuvo la fuga que dejaba leer el certificado `.p12` de otra organización. Es el hueco más caro del inventario.

## Principios que se siguen (y que conviene mantener)

### 1. Verificar con una herramienta independiente

No basta con que pase el código que escribimos. En facturación:

- la **firma XAdES** se verifica con `xml-crypto`, no con el mismo código que la genera;
- el **XML** se valida contra los **XSD oficiales del SRI** con libxml2 (`xmllint-wasm`), que es la misma validación que hace el SRI al recibir.

### 2. Los tests documentan el comportamiento REAL, no el deseado

Regla de oro de `frontend/e2e/docs/OPENCODE-BRIEF.md`: cuando hay un bug confirmado, el test **reproduce la condición y afirma el comportamiento actual**, con un comentario que dice qué debería pasar y a qué hallazgo corresponde.

Así, el día que alguien lo arregle sin querer, la suite avisa; y el día que lo arregle a propósito, sabe exactamente qué test actualizar. **Nunca se "corrige" el assert para que pase en silencio.**

### 3. Marcar los fallos abiertos con un test que falla

En los servicios, el equivalente es `it.fails` / `test.fail` con el comentario `FALLO CONOCIDO`. Cuando el problema se arregla, el test empieza a pasar, salta la marca y se retira. Fue así como se cerraron el IVA doble, el tipo de identificación mal declarado y la descarga pública de certificados.

### 4. Capturar respuestas reales del servicio externo

Los SOAP Fault reales de celcer se capturaron y se usan como fixtures. Un mock escrito a mano habría reproducido lo que creíamos que devolvía el SRI, que era justamente lo que estaba mal.

### 5. Probar los manifiestos como se prueba el código

`k8s-manifests.test.ts` compara las URLs de los deployments contra los Services reales del clúster. Detecta las tres URLs rotas (`document-service-node:3007` y compañía) si alguien deshace el arreglo.

## El plan de pruebas y los bugs conocidos

Dos documentos viven en el repo de código, en `frontend/e2e/docs/`:

- **`TEST-PLAN.md`** — los casos de uso e invariantes del CRM, elaborado el 2026-09-05 **sobre el código, no sobre esta bóveda**, con archivo:línea de dónde vive cada regla. Marca con ⚠️ los hallazgos confirmados y **anota explícitamente cada divergencia entre el código y estos documentos de diseño**. Es una segunda opinión valiosa sobre la bóveda.
- **`OPENCODE-BRIEF.md`** — cómo escribir los tests que lo verifican.

Los specs `known-bugs.spec.ts` y `gaps.spec.ts` son la traducción de esos hallazgos a tests.

## Los specs end-to-end

15 specs en `frontend/e2e/specs/`: `auth`, `roles`, `employees`, `customers`, `products`, `org`, `plugins`, `onboarding`, `invoices`, `invoice-form`, `fiscal`, `sri-emision`, `seguridad-documentos`, `known-bugs`, `gaps`.

| Comando | Qué hace |
|---|---|
| `npm run test:e2e` | todo |
| `npm run test:e2e:sri` | emisión real contra el SRI de pruebas + aislamiento de documentos |
| `npm run test:e2e:ui` / `:debug` | modo interactivo |

Detalles que cuestan tiempo si no se saben:

- `test:e2e:sri` **crea su propia organización** y firma con un `.p12` autofirmado que genera `fiscal-ecuador/scripts/make-test-p12.mjs`. Necesita `VITE_API_URL=http://localhost:8080` en el entorno de Vite.
- Los specs antiguos (`fiscal`, `invoices`) dan por hecho que la organización del admin ya está configurada: plugins activos, establecimiento con dirección y algún producto.
- Los tests de integración usan el MySQL de Docker por **`127.0.0.1`**, no `localhost`: en la máquina de desarrollo `localhost` resuelve a `::1`, que es el MySQL de Windows.

## Lo que falta

1. **Tests del api-gateway**, empezando por el borrado de cabeceras y el gate de plugins.
2. **Tests de integración** más allá de fiscal-ecuador: el patrón (`vitest.integration.config.ts` + MySQL de Docker) ya está resuelto y es copiable.
3. **Algo de unitario en el frontend**: hoy todo depende de los e2e, que son lentos y necesitan el stack entero.
