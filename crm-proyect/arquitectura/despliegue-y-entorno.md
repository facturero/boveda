# Despliegue, infraestructura y entorno local

[← Volver al índice](../README.md) · [migraciones](./migraciones.md) · [observabilidad](./observabilidad.md) · [pruebas](./pruebas.md)

> **Verificado el 2026-09-14.** Esta bóveda no tenía nada sobre cómo se despliega ni cómo se levanta en local. La guía paso a paso vive en el repo de código (`LEVANTAR-DESDE-CERO.md`, 451 líneas) y las reglas de trabajo en `AGENTS.md`; esto es el mapa.

## Un repositorio por servicio

Cada servicio es **su propio repo de git** bajo la organización `facturero` de GitHub, y todos están clonados dentro de `cmr-proyect/backend/`. El repo contenedor **no** es un monorepo con git: no tiene control de versiones propio.

Consecuencia práctica: un cambio que toca tres servicios son tres commits y tres despliegues, y hay que pensar el **orden** cuando cambia algo compartido (un secreto, un contrato de evento).

## CI/CD

17 workflows de **GitHub Actions**, uno por repo:

```
push a main/master
  → build de la imagen → ghcr.io/facturero/<repo>/<servicio>:<sha>
  → envsubst | kubectl apply  (deployment + service)
  → kubectl rollout status --timeout=180s
```

- Los **secretos** los crea el workflow desde los *secrets* de GitHub. Además hay **SOPS + age**, con la clave en `~/.config/sops/age/keys.txt` **del servidor**, para los `config/secrets.production.enc` de cada repo.
- Las **migraciones** corren solas: cada deployment lleva un `initContainer` que las ejecuta antes de arrancar el servicio. Ver [migraciones](./migraciones.md).
- `./check_runs.sh`, en la raíz del repo de código, imprime el estado de los últimos despliegues de los doce servicios principales.

## El servidor

**k3s de un solo nodo en `192.168.100.149`** (IP fija, por cable), con **Traefik** como ingress y **cloudflared** publicando `crm.noahsolution.com` y `api.noahsolution.com`.

Entre cloudflared y el gateway hay una pieza que conviene conocer: una unidad de systemd (`tunnel-proxy-8080.service`) que hace de **proxy TCP de `localhost:8080` al NodePort del gateway**, porque el túnel apunta a un puerto local estable y el NodePort no lo es.

### La trampa que ya costó horas

Si el CRM da **502 solo en `crm`** mientras `api` funciona: la IP del nodo cambió y el Service `kubernetes` apunta a una IP muerta, así que Traefik pierde el apiserver y se queda sin backends.

```bash
kubectl get endpoints kubernetes    # debe coincidir con
ip -4 -o addr show eno1             # la IP real del nodo
```

Está mitigado con IP estática en netplan y `node-ip` en `/etc/rancher/k3s/config.yaml`. Traefik se recupera solo cuando el apiserver vuelve a ser alcanzable; **no hace falta reiniciarlo**.

### Acceso desde Windows

`sshpass` no funciona; se usa `plink` de PuTTY. La máquina de observabilidad es otra: `192.168.100.183`, usuario `obs`, y allí `kubectl` necesita `sudo`. Ver [observabilidad](./observabilidad.md).

## La infraestructura de datos

Tres repos que son **solo manifiestos**, sin código de aplicación:

| Repo | Qué despliega |
|---|---|
| `mysql-basic` | MySQL 9 (una base por servicio dentro de la misma instancia). Credenciales con SOPS, no con secrets de GitHub |
| `rabbitmq-basic` | RabbitMQ, exchange `crm.events` |
| `minio-basic` | MinIO, el almacén de archivos de document-service |

⚠️ **`backend/k8s/` no está bajo control de versiones** y contiene los manifiestos de MinIO **que de verdad están en producción**; el repo `minio-basic` define otro Deployment que nadie usa. Es una trampa conocida: al tocar MinIO hay que mirar `backend/k8s/minio.yaml`, no el repo.

### Scripts sueltos en `backend/`

Pequeños, sin documentar en ninguna parte, y fáciles de perder:

| Script | Qué hace |
|---|---|
| `encrypt-and-push.sh` | re-cifra `secrets.production.env` → `.enc` con SOPS y hace commit + push **en cada microservicio**. No desencripta para verificar (no hay clave privada age en la máquina de desarrollo): solo comprueba que el `.enc` tenga formato SOPS-dotenv. La verificación real ocurre en el runner |
| `healthcheck.sh` | prueba de humo de document-service y el gateway dentro del clúster, incluida la generación de una URL prefirmada |
| `hosttest.sh` + `hosttest.mjs` | ejecuta un script Node **dentro del pod del gateway** para diagnosticar resolución de nombres y alcance de los Services |

## Entorno local

`docker-compose.yml` levanta el sistema entero: MySQL, RabbitMQ, MinIO (con `createbuckets`), los **doce servicios**, el gateway y el frontend. Cada servicio tiene su contenedor `*-migrate` que corre las migraciones antes de arrancar, igual que el `initContainer` de producción.

Detalles que importan:

- En la máquina de desarrollo **`localhost` resuelve a `::1`**, que es el MySQL de Windows, no el de Docker. Para hablar con el de Docker hay que usar **`127.0.0.1`**.
- El `.env` del repo apunta al servidor; los tests que necesitan el stack local esperan `VITE_API_URL=http://localhost:8080`.
- El gateway local escucha en **8080**.

- `docker/mysql/init.sql` crea **las trece bases** (incluida `pos_db`) y un usuario por servicio. Las contraseñas están **en claro** ahí: es un fichero de desarrollo y no debe usarse como plantilla de producción.

La guía de puesta en marcha completa es `LEVANTAR-DESDE-CERO.md` en el repo de código.

⚠️ **Workflow muerto:** `.github/workflows/deploy-product-service.yml`, en la raíz del repo contenedor, es un resto de cuando esto era un monorepo — se dispara por cambios en `backend/product-service/**`, pero el repo contenedor no tiene git. El despliegue real de product-service lo hace el workflow de **su propio repo**.

## Datos de demostración: `seed/`

Una herramienta aparte (`cmr-seed`) que **maneja el navegador con Puppeteer** y crea datos de demostración **a través de la interfaz real**, no insertando en la base: administrador, establecimientos, productos y empleados.

- `npm run seed` — desde cero; `npm run seed:resume` — retoma donde se quedó, usando `state.json`.
- Comprueba contra la base (`getEstablishments`, `countProducts`, `countActiveMemberships`) lo que ya existe, para ser idempotente.
- Mata procesos zombis de Chrome antes de empezar.

Que siembre **por la interfaz** tiene una ventaja: si el alta de un producto se rompe, el seed falla — es también una prueba de humo.

## Documentos del repo de código (no de esta bóveda)

Para no duplicar ni contradecir, esto es lo que hay allí y qué manda en cada cosa:

| Archivo | Qué es | Manda en |
|---|---|---|
| `AGENTS.md` | reglas de trabajo, servidor, problemas conocidos | cómo trabajar en el repo |
| `LEVANTAR-DESDE-CERO.md` | puesta en marcha paso a paso | entorno local |
| `README.md`, `API.md`, `DATABASE.md` | panorama, endpoints y esquema | detalle de implementación |
| `FACTURACION-BRECHAS.md` | la auditoría fiscal completa | ver [facturación electrónica](../facturacion-electronica/README.md) |
| `frontend/e2e/docs/TEST-PLAN.md` | invariantes con archivo:línea | ver [pruebas](./pruebas.md) |
| `pos/rules.md`, `pos/CHANGELOG.md`, `pos/todo.md` | reglas y decisiones del POS | ver [POS](../pos/punto-de-venta.md) |

Esta bóveda manda en **el porqué y el panorama**; esos archivos mandan en **el detalle y el procedimiento**.

### Contratos de API (OpenAPI / AsyncAPI)

Ocho servicios llevan su contrato versionado junto al código: **auth, organization, customer, product, tax, billing, document e inventory** tienen `openapi.yaml` + `asyncapi.yaml`; audit-log tiene solo `openapi.yaml` (no publica eventos). Siete llevan además un `IMPLEMENTATION.md` con las decisiones del código.

⚠️ **Sin contrato, teniendo API pública:**

| Servicio | Qué falta |
|---|---|
| `fiscal-ecuador` | ni OpenAPI ni AsyncAPI, y **publica siete tipos de evento** (`fiscal.ec.invoice.*`) |
| `notification-service` | ni OpenAPI ni AsyncAPI |
| `plugin-catalog-service` | ni OpenAPI ni AsyncAPI, y **publica eventos `plugin.*`** que el gateway usa para invalidar su caché |
| `assistant-service` | sin OpenAPI |
| `api-gateway-node` | sin OpenAPI (es el borde: sería el más útil de todos) |

Los tres primeros son los que más duelen, porque otros servicios dependen de sus eventos. Mientras no existan, la referencia son las fichas de [servicios/](../servicios/) y el código.

## Problemas de infraestructura sin resolver

De la lista de `AGENTS.md`, verificada el 2026-09-14:

1. **Token de GitHub en texto plano** en el remoto de `backend/outbox-relay` (`.git/config`): hay que revocarlo y limpiar el remoto.
2. `backend/k8s/` sin control de versiones (ver arriba).
3. **Sin reserva DHCP** para la MAC del cable del servidor: el router podría dar la `.149` a otro equipo.
4. **SSH con contraseña débil**, autenticación por contraseña activa y `ufw` inactivo.
5. `frontend/src/styles/variables.scss` no lo importa nadie: código muerto.

> La lista de `AGENTS.md` dice además "5 servicios sin instrumentar" y señala a fiscal-ecuador y notification-service. **Eso ya no es exacto**: fiscal-ecuador se instrumentó el 2026-09-13. El recuento vigente está en [observabilidad](./observabilidad.md).
