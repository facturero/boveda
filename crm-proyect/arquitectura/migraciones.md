# Migraciones: que se ejecuten solas y que fallen ruidosamente

> Análisis y diseño. Nace de que producción se ha roto varias veces por
> migraciones que nunca llegaron a ejecutarse.

> ✅ **Resuelto (verificado el 2026-09-14).** Los **13 servicios con base de datos** ejecutan ya sus migraciones al desplegar, con un `initContainer` en su `deployment.yaml` (el único sin él es el api-gateway, que no tiene base). Lo de abajo queda como el diagnóstico que lo motivó y como el patrón a seguir al añadir un servicio nuevo.
>
> Los `rollout status` usan `--timeout=180s`: una migración lenta ya no hace fallar el despliegue por impaciencia.

## El problema, medido (diagnóstico de 2026-09-09, ya corregido)

Verificado contra el servidor el **2026-09-09**:

| Hecho | Alcance |
|---|---|
| Servicios que ejecutan migraciones al desplegar | **3 de 11**: auth, audit-log, plugin-catalog |
| Servicios con migraciones que **no** las ejecutan | **8**: organization, customer, product, tax, billing, document, notification, fiscal-ecuador |
| Migraciones que dependen de que alguien se acuerde | 28 repartidas en esos ocho |

A eso se suman tres agravantes que ya han costado caro:

1. **Las semillas se repiten en cada arranque.** plugin-catalog es el único que
   corre `db:seed:all` en producción, y su `sequelize.config.cjs` no define
   `seederStorage`. Sin eso sequelize-cli no registra nada: cada reinicio
   reejecuta todas las semillas. Con una semilla no idempotente
   (`20260909090001-seed-business-profiles`) el contenedor de arranque muere con
   "Validation error".
2. **Cuando eso pasa, producción se queda con la versión anterior en silencio.**
   El 2026-09-09 el pod nuevo estuvo **3 h 43 min** en `Init:CrashLoopBackOff`
   con 47 intentos mientras el pod viejo seguía atendiendo, con un fallo ya
   corregido en el código que no llegaba a desplegarse. Desde fuera, la web
   respondía: solo devolvía 500 en una ruta concreta.
3. **El pipeline no avisa a tiempo.** Los workflows terminan con
   `kubectl rollout status deployment <nombre>` **sin `--timeout`**, así que se
   quedan esperando hasta que GitHub corta el job horas después. Nadie mira un
   job que sigue "en marcha".

Dos imágenes (`billing-service` y `fiscal-ecuador`) tampoco copian
`.sequelizerc`, así que el comando estándar falla ahí con "Cannot find
/app/config/config.json" y hay que pasarle las rutas a mano.

## Principios

1. **El esquema se actualiza antes de que arranque el código nuevo**, siempre,
   sin que nadie se acuerde de nada.
2. **Reintentar no rompe.** Todo el mecanismo tiene que poder ejecutarse dos
   veces seguidas sin consecuencias.
3. **Si falla, el despliegue falla**: rápido, visible y en rojo. Nunca se queda
   sirviendo la versión anterior sin que conste.
4. **Una sola forma**, idéntica en los once servicios. Hoy hay tres formas y
   ocho ausencias.

## Decisión: dónde se ejecutan

### Opción A — initContainer en los once servicios *(recomendada ahora)*

Es el patrón que ya usan tres servicios y funciona. El contenedor de arranque
lleva la misma imagen que la aplicación, así que las migraciones que ejecuta son
exactamente las del código que va a arrancar.

```yaml
initContainers:
  - name: <servicio>-migrate
    image: ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
    command: ["sh", "-c", "npx sequelize-cli db:migrate"]
    env: [ ... las mismas credenciales de BD que el contenedor principal ... ]
```

- **A favor:** cero infraestructura nueva, cubre también los reinicios del nodo
  (que en este cluster pasan), y es imposible que la aplicación arranque contra
  un esquema viejo.
- **En contra:** con más de una réplica, cada pod ejecuta lo mismo a la vez y
  sequelize-cli no toma ningún lock. Hoy todos los Deployment tienen **una**
  réplica, así que no es un problema todavía; sí lo será el día que se escale.
- **En contra:** si falla, bloquea el rollout y deja viva la versión anterior.
  Eso es lo correcto (mejor lo viejo que código nuevo contra esquema viejo),
  pero **obliga** a que el punto siguiente esté resuelto.

### Opción B — Job en el pipeline, verificación en el pod *(para cuando haya réplicas)*

El CI aplica un `Job` con la imagen nueva, espera a que termine y solo entonces
actualiza el Deployment. El pod, al arrancar, se limita a **comprobar** que no
quedan migraciones pendientes (`db:migrate:status`) y se niega a arrancar si las
hay.

- **A favor:** se ejecuta una sola vez pase lo que pase, el fallo aparece en el
  pipeline antes de tocar producción, y el pod conserva la red de seguridad.
- **En contra:** un manifiesto más por servicio y un paso más en cada workflow.

Migrar de A a B más adelante es cambiar el comando del initContainer por el de
verificación y añadir el Job. No hay que rehacer nada.

## Semillas: no son migraciones

La regla que falta y que explica el incidente:

> En producción **no se ejecutan seeders**. Los datos que deben existir sí o sí
> viajan en una migración.

No es purismo: es lo que ya se hace bien en otros servicios y por eso nunca han
fallado. El catálogo fiscal de Ecuador vive en
`tax-service/migrations/20260705120001-seed-ecuador.js`, y el catálogo RBAC en
una migración de auth. Al ir como migraciones quedan registradas en
`SequelizeMeta` y no se repiten jamás.

Para plugin-catalog, que hoy corre `db:seed:all` en el arranque, hay dos salidas:

1. **Mover las tres semillas a `migrations/`** y quitar `db:seed:all` del
   comando. Es la que encaja con el resto del sistema.
2. **Quedarse con los seeders**, y entonces hacen falta las dos cosas a la vez:
   - `seederStorage: 'sequelize'` en `sequelize.config.cjs`, para que se
     registren en `SequelizeData` y no se repitan, y
   - que sean **idempotentes** de todos modos (`INSERT ... ON DUPLICATE KEY
     UPDATE` o comprobar antes de insertar), porque en los entornos que ya
     existen la tabla de registro nace vacía y la primera ejecución volvería a
     chocar con los datos que ya están.

Sea cual sea la salida, la idempotencia no es opcional: es lo que convierte un
reinicio en algo aburrido.

## Fallar rápido y que se note

- `kubectl rollout status deployment <nombre> --timeout=180s` en los doce
  workflows. Sin el timeout, el fallo tarda horas en manifestarse y se confunde
  con "aún desplegando".
- Con el timeout, el job termina en rojo y el fallo se ve donde toca.
- Conviene además revisar el estado de los despliegues periódicamente. Ya existe
  `check_runs.sh` en la raíz del monorepo para mirar los workflows.

## Escribir migraciones que sobrevivan al rollout

Durante un despliegue conviven el pod viejo y el nuevo contra **la misma base**.
Una migración que rompa el código anterior tumba producción durante la ventana.
La regla es separar en dos despliegues lo que se hace en uno:

- **Ampliar primero**: columnas nuevas siempre `NULL` o con default; tablas
  nuevas; índices. El código viejo las ignora.
- **Reducir después**, en un despliegue posterior: borrar columnas, hacerlas
  `NOT NULL`, renombrar. Para entonces ya no queda código que las use.
- Nunca renombrar en un solo paso: se añade la nueva, se copia, se despliega, y
  en el siguiente se borra la vieja.

## Plan de ejecución

| Fase | Qué | Dónde | Por qué en este orden |
|---|---|---|---|
| 1 | Arreglar la semilla de perfiles de negocio: idempotente, o convertida en migración | plugin-catalog-service | Es lo único que bloquea despliegues **hoy** |
| 2 | Copiar `.sequelizerc` en la imagen de billing y fiscal-ecuador | esos dos repos | Sin eso, el paso 3 no puede funcionar ahí |
| 3 | initContainer de migración en los ocho servicios que no lo tienen | ocho repos | El grueso del problema |
| 4 | `--timeout=180s` en el `rollout status` de los doce workflows | doce repos | Convierte un fallo silencioso en un fallo visible |
| 5 | Documentar la recuperación manual en `LEVANTAR-DESDE-CERO.md` | monorepo | Hoy ese runbook no explica ni cómo crear las bases |
| 6 | *(cuando haya más de una réplica)* pasar a Job + verificación | todos | Solo entonces compensa |

Las fases 2 a 4 son mecánicas y repetitivas: mismo bloque YAML, mismo cambio de
línea. Se pueden hacer de una tirada.

## Recuperación manual, mientras tanto

Lo que hubo que hacer el 2026-09-09, por si vuelve a pasar antes de la fase 1:

```bash
# 1. Ver por qué no arranca el pod nuevo
kubectl logs <pod> -c <servicio>-migrate --tail=20

# 2. Si es la semilla no idempotente: vaciar lo que va a resembrar
#    (business_profile_plugins, _translations, organization_business_profiles,
#    business_profiles — en ese orden por las claves ajenas)

# 3. Borrar el pod atascado para que reintente
kubectl delete pod <pod>
```

Y para un servicio que nunca migró, el comando que sí funciona en todos:

```bash
kubectl exec deploy/<servicio> -- sh -c \
  'cd /app && npx sequelize-cli db:migrate \
     --config /app/sequelize.config.cjs --migrations-path /app/migrations'
```

## Qué no resuelve este plan

- **Rollback de esquema.** Sequelize tiene `db:migrate:undo`, pero deshacer una
  migración con datos encima rara vez es seguro. La respuesta a una migración
  mala sigue siendo otra migración que la corrija.
- **Bases distintas por entorno.** Hoy solo hay producción. El día que haya
  staging, este mismo mecanismo vale sin cambios.
