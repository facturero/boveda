# Observabilidad (OpenTelemetry + SigNoz)

[← Volver al índice](../README.md) · [microservicios](./microservicios.md) · [migraciones](./migraciones.md)

> **Estado: funcionando.** Verificado el 2026-09-14. Los manifiestos viven en `observability/k8s` del repo de código, que es la **fuente de verdad** (la copia en `~/manifests` del nodo se desincroniza).

## Qué se mide

Tiempos de respuesta, errores y throughput (métricas RED) de los servicios Node + Hono + Sequelize + MySQL. **Sin logs** en esta iteración: solo trazas y métricas.

## Topología

```
App (Node) ──OTLP HTTP 4318──▶ OTel Collector (DaemonSet en el clúster del CRM, ns observability)
                                    │ k8sattributes + batch + spanmetrics
                                    ▼ OTLP gRPC
                            192.168.100.183:30017 (NodePort)
                                    │
                             SigNoz (k3s standalone en .183, ns signoz)
                             clickhouse + query-service + frontend + collector
```

| Máquina | Papel | Usuario SSH |
|---|---|---|
| `192.168.100.149` | k3s con el CRM. Solo corre el **DaemonSet intermedio** del collector | `server` |
| `192.168.100.183` | k3s standalone **solo para monitoreo**: SigNoz completo | `obs` |

⚠️ **El backend de SigNoz no va en el clúster del CRM.** Estuvo ahí y se movió el 2026-09-11.

NodePorts **fijados en el manifiesto** y estables entre reconstrucciones: **UI 30012**, OTLP gRPC 30017, OTLP HTTP 30018. Los demás se reasignan al azar — por eso el collector de `.149` sobrevive a un rebuild de SigNoz sin tocar nada.

## Cómo se instrumenta un servicio

El SDK arranca **solo si `OTEL_EXPORTER_OTLP_ENDPOINT` está definida**, e instrumenta HTTP (un span por petición), Sequelize y mysql2 (un span por consulta SQL).

En un servicio **ESM** el SDK tiene que precargarse antes que nada: `node --import ./dist/instrumentation.js`. Es lo que hace fiscal-ecuador.

⚠️ Tener las variables `OTEL_*` en el deployment **no instrumenta nada** si el paquete no está instalado: fiscal-ecuador las tuvo meses exportando a ninguna parte.

### Cobertura al 2026-09-14

| Instrumentados | Sin instrumentar |
|---|---|
| api-gateway, auth, customer, product, tax, document, fiscal-ecuador, inventory | organization, billing, notification, plugin-catalog, audit-log, assistant |

Que **billing y organization** falten es lo más notable: la traza de una emisión de factura se corta justo en el servicio que la emite.

## Alertas

SigNoz **no tiene canal nativo de Telegram** (sus canales son Slack, correo, webhook, PagerDuty y Opsgenie). La vía es webhook + traductor: `k8s/04-telegram-bridge.yaml` despliega un puente en la ns `signoz` de `.183`, con el script Node dentro de un ConfigMap sobre `node:20-alpine` — sin construir una imagen para 74 líneas. Está desplegado y probado; **falta rellenar el secreto `telegram-bridge`** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).

### Umbrales medidos (baseline real, no inventado)

Cero errores en 18 000 trazas, p99 ≤ 16 ms en todos los servicios, con un pico de 414 ms en el gateway.

⚠️ **Los 4xx no marcan `has_error`**: hay 401 y 404 en el gateway con el flag en falso. Una alerta de errores debe mirar `response_status_code >= 500`, no el flag. Para detectar colgados sirven `http.server.active_requests` (peticiones que entran y no terminan) y la **ausencia** de `signoz_calls_total` (servicio mudo).

## Trampas conocidas

- **El namespace `signoz` se queda en `Terminating` para siempre** si se borra el operador antes que el `ClickHouseInstallation`, que tiene finalizador. Desbloqueo: `kubectl patch chi signoz-clickhouse -n signoz --type=merge -p '{"metadata":{"finalizers":[]}}'`.
- **`signoz-otel-collector` miente en su estado**: pasa a `1/1 Running` aunque no esté ingiriendo (la sonda de readiness pasa pero los receptores OTLP no se abren). Verificar el puerto 30018 de verdad, y tras completar el formulario inicial hacer `rollout restart`.
- **La contraseña de la UI es bcrypt en `/var/lib/signoz/signoz.db`**: no es recuperable, solo reseteable. Para resetear el login basta con borrar ese fichero (y sus `-wal`/`-shm`) y reiniciar el StatefulSet.
- **Pantalla Infrastructure**: necesita `hostmetrics` + `resourcedetection` en el collector, con `root_path: /hostfs` y un `hostPath: /` en solo lectura. `host.name` se rellena con la downward API (`spec.nodeName`), no con el hostname del pod. No hace falta root ni `privileged`. El nodo `.183` no aparece ahí porque no tiene collector propio.
