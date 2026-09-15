# Operación

[← Facturación electrónica](./README.md) · [Pendientes y riesgos](./pendientes-y-riesgos.md) · [Topología de despliegue](../arquitectura/microservicios.md)

Configurar, verificar, desplegar y diagnosticar la facturación electrónica.

## Configuración de `fiscal-ecuador`

| Variable | Default | Nota |
|---|---|---|
| `PORT` | `3010` | El Service es **ClusterIP**: solo lo llama el gateway |
| `DB_*` | `fiscal_ec_db` | Base propia, como todos |
| `RABBITMQ_URL` | — | Sin ella no consume eventos |
| `DOCUMENT_SERVICE_URL` | — | En el clúster: `http://document-service:3003` |
| `TAX_SERVICE_URL` | — | `http://tax-service:3005` |
| `ORG_SERVICE_URL` | — | `http://organization-service:3002` |
| `INTERNAL_SERVICE_SECRET` | *(dev)* | Secret compartido `internal-service-secret` |
| `CERTIFICATE_MASTER_KEY` | *(dev)* | Secret `fiscal-db/certMasterKey`, cifra las contraseñas de los `.p12` |
| `SRI_ENVIRONMENT` | `pruebas` | ConfigMap `fiscal-config`, clave `sriEnvironment` (opcional) |
| `SRI_RECEPTION_URL` / `SRI_AUTHORIZATION_URL` | *(del ambiente)* | Solo para apuntar a un simulador |
| `SRI_TIMEOUT_MS` | `30000` | |
| `RIDE_QR_URL` | *(del ambiente)* | Contenido del QR del RIDE |

⚠️ Los nombres de Service importan: los originales (`document-service-node:3007`, `tax-service-node`, `organization-service-node`) **no existen** en el clúster y daban `ENOTFOUND`, así que el servicio nunca pudo bajar un certificado, subir un XML ni leer los catálogos. Hay un test (`k8s-manifests.test.ts`) que compara las URLs de los manifiestos contra los Services reales y falla si alguien las vuelve a romper.

⚠️ **En producción el servicio se niega a arrancar** si `CERTIFICATE_MASTER_KEY` o `INTERNAL_SERVICE_SECRET` tienen los valores de desarrollo del repo, o si el ambiente y las URLs del SRI se contradicen. Es deliberado: arrancar con la clave maestra de ejemplo deja las contraseñas de los `.p12` cifradas con una clave pública.

## Pasar a producción

1. **Requisito previo, no negociable:** RUC registrado como emisor electrónico y certificado de firma emitido por una entidad acreditada (Security Data, ANF, Uanataca…). Sin eso el SRI nunca autoriza, en ningún ambiente.
2. Crear el ConfigMap:
   ```bash
   kubectl create configmap fiscal-config --from-literal=sriEnvironment=produccion
   kubectl rollout restart deployment/fiscal-ecuador
   ```
   Las URLs de `cel.sri.gob.ec` salen solas del ambiente. **No** hay que tocar `SRI_RECEPTION_URL`.
3. Subir el certificado acreditado de la organización desde Ajustes → Organización (`POST /certificates`, permiso `fiscal:manage`).
4. Emitir un comprobante de prueba real y confirmar que llega a `authorized`.

## Cómo verificarlo

| Qué | Comando | Dónde |
|---|---|---|
| Unitarios (XML, validación, códigos, clave, SOAP, firma, procesador, config, manifiestos) | `npm test` | `backend/fiscal-ecuador` |
| Integración sobre MySQL real (migraciones, repositorios, procesador) | `npm run test:integration` | idem |
| Emisión real contra el SRI de pruebas, de punta a punta por la interfaz | `npm run test:e2e:sri` | `frontend` |

Detalles que cuestan tiempo si no se saben:

- Los tests de integración usan el **MySQL de Docker vía `127.0.0.1`**, no `localhost`: en esta máquina `localhost` resuelve a `::1`, que es el MySQL de Windows. Bases `fiscal_it_*`.
- El e2e de SRI crea su propia organización y emite contra celcer con un `.p12` autofirmado que genera `fiscal-ecuador/scripts/make-test-p12.mjs`. Necesita Vite con `VITE_API_URL=http://localhost:8080` en el entorno (el `.env` apunta a otra IP).
- Con el `.p12` autofirmado **nunca saldrá AUTORIZADO**: el SRI llega a validar el contribuyente y rechaza por RUC inventado. Eso es el resultado esperado del e2e; prueba todo el camino salvo el sello final.
- Los tests marcados `FALLO CONOCIDO` (`it.fails` / `test.fail`) señalan fallos abiertos: fallan cuando el problema se arregla, y entonces se les quita la marca.
- Estado de despliegue de los doce servicios: `./check_runs.sh` en la raíz del repo de código.

## Orden de despliegue

Importa cuando cambian secretos compartidos. El orden que se usó el 2026-09-14 y que sigue valiendo si se vuelve a tocar el secreto interno:

1. **api-gateway-node** — deja de reenviar `X-Internal-Secret` desde fuera y empieza a reenviar los avisos fiscales.
2. **document-service** y enseguida **fiscal-ecuador** — los dos pasan a usar `internal-service-secret` a la vez. Entre uno y otro, fiscal recibe 401 de document-service.
3. **customer-service**, **billing-service**, **notification-service**, **frontend** — cualquier orden.

El secret `internal-service-secret` debe existir en el clúster; **no lo crea ningún workflow**.

## Diagnóstico de los fallos típicos

| Síntoma | Causa probable |
|---|---|
| Todo acaba en `rejected` sin motivo claro | Sobre SOAP o namespace equivocado: un Fault se está leyendo como DEVUELTA. Mirar `sri_response` crudo |
| `signer.sign is not a function` | La firma llamando a una API que no existe en node-forge |
| `fetch failed` al bajar el `.p12` | Se está usando `/files/:id/download` (redirige a MinIO público) en vez de la ruta interna `/files/:id/content` |
| `ENOTFOUND` a document/tax/organization | Nombres de Service equivocados en el deployment |
| Se factura sin catálogo de IVA ni datos RIMPE | Llamadas internas sin cabeceras: tax responde 401 y organization 403 |
| Comprobante con la fecha del día siguiente | Se está usando la hora UTC del pod en vez de `America/Guayaquil` |
| El SRI dice "clave ya registrada" (43/45) | Reenvío del mismo comprobante. Es correcto: se interpreta como `sent` |
| La campana no suena con un error fiscal | El evento no llevaba `userId`, o el hub del gateway no reenvía `fiscal.ec.invoice.*` |
| `ARCHIVO NO CUMPLE ESTRUCTURA XML` | Validar el XML generado contra el XSD oficial (está en `test-resources/sri-xsd/`) |

## Observabilidad

`fiscal-ecuador` exporta trazas por OTLP (`src/instrumentation.ts`, precargado con `--import` porque el servicio es ESM). SigNoz vive en una PC dedicada, no en el nodo del CRM. Antes el deployment tenía las variables de OTel sin ninguna dependencia instalada: exportaba a ninguna parte.
