# Historial de hallazgos (auditoría 2026-09-13/14)

[← Facturación electrónica](./README.md) · [Reglas del SRI](./reglas-sri.md) · [Pendientes](./pendientes-y-riesgos.md)

Por qué el código es como es. La lista original vive en `FACTURACION-BRECHAS.md`, en la raíz del repo de código; aquí queda lo que explica decisiones.

## El punto de partida

Una revisión de la facturación electrónica produjo una lista de 40 brechas. Al verificarlas una a una **resultó que la propia lista daba por bueno lo que no funcionaba**, porque nadie había ejercitado el flujo: en la base de producción de fiscal había **0 facturas y 0 certificados**.

Lo que se creía hecho y no lo estaba:

| # | Se creía | Realidad |
|---|---|---|
| N1 | Firma XAdES-BES funcionando | Llamaba a `forge.pki.rsa.sign`, que no existe: toda factura con certificado moría con `signer.sign is not a function` |
| N2 | Firma correcta | Aun firmando, no habría validado: cinco diferencias entre lo hasheado y lo que se verifica tras canonicalizar |
| N3 | Envío SOAP real a celcer | Namespace `cfactura` y `claveAccesoConsultada` en vez de `ec.gob.sri.ws.recepcion`/`autorizacion` y `claveAccesoComprobante`. El SRI devolvía Fault y el código lo registraba como DEVUELTA |
| N4 | Servicios internos alcanzables | `document-service-node:3007`, `tax-service-node`, `organization-service-node` no existen en el clúster: `ENOTFOUND` |

**La lección:** tres cosas independientes estaban rotas a la vez y el sistema parecía sano, porque el camino nunca se recorría. De ahí que ahora haya tests que ejecutan el flujo entero (de 1 archivo con 5 tests a 13 archivos con 144).

## Hallazgos de la primera ronda

- **N5. Secretos de desarrollo en producción.** `CERTIFICATE_MASTER_KEY` e `INTERNAL_SERVICE_SECRET` del pod de fiscal eran exactamente los valores por defecto del repo; document-service ni siquiera tenía la variable, mientras billing, auth y organization usaban el secret real. **Arreglado**: todos leen `internal-service-secret`, la clave maestra rotada en `secrets.production.enc` (sops), y fiscal se niega a arrancar en producción con valores de desarrollo. Fue barato porque no había certificados cifrados con la clave vieja.
- **N6. IVA cobrado dos veces** con `priceIncludesTax`: la línea guardaba el subtotal con IVA dentro y el total volvía a sumar el IVA. **Arreglado en billing**: la línea guarda siempre importes sin impuestos y el IVA se calcula una vez sobre la base. Puede haber hasta 1 centavo por unidad de diferencia con el precio de góndola, pero la factura cuadra con las reglas del SRI.
- **N7. Violaciones de esquema** que el SRI habría rechazado: `tarifa` como `"15.00.00"`, `codigoPrincipal` con un UUID de 36 caracteres (máx. 25), `<infoAdicional>` vacío, y la fecha en UTC del pod.
- **N8. `GET /fiscal-invoices/:id` devolvía la fila entera**, incluido `original_payload` con los datos del cliente. Ahora devuelve un DTO.

## Hallazgos de la ronda de tests

Encontrados **por los tests nuevos**, no leyendo el código:

- **N9. `upsert` pisaba facturas ajenas.** En MySQL es `INSERT … ON DUPLICATE KEY UPDATE` y salta con *cualquier* índice único: una factura nueva con un número ya usado reemplazaba la fila entera de la otra, id incluido, sin error. Ahora insert/update explícito.
- **N10. Fiscal no podía leer el `.p12`.** `/files/:id/download` redirige a una URL prefirmada del MinIO **público**, inalcanzable desde dentro del clúster. Se añadió la ruta interna `/files/:id/content`, protegida por el secreto compartido.
- **N11. Fiscal leía catálogos y perfil sin cabeceras.** tax-service respondía 401 y organization-service 403: se facturaba sin catálogo de IVA ni datos RIMPE, sin avisar.
- **N12. Cualquier usuario podía leer el `.p12` de otra organización.** El gateway reenviaba `X-Internal-Secret` desde fuera y su valor de desarrollo está en el repo. Comprobado con dos organizaciones (HTTP 200). Arreglado en el gateway, que ahora lo borra como las cabeceras de identidad.
- **N13. Descarga pública de archivos por id.** Cerrado para certificados y comprobantes fiscales; los archivos se acotan por organización. Sigue abierto para imágenes, que la interfaz pinta con `<img src>` sin token.
- **N14. Tipo de identificación mal declarado.** El cliente guardaba el id del catálogo de customer-service y fiscal lo buscaba en el de tax-service: **los ids no coinciden**. No lo encontraba y adivinaba por número de dígitos, así que un pasaporte de 10 dígitos salía declarado como cédula. Ahora viaja el **código**, no el id.
- **N15.** (Fuera de facturación) `INVENTORY_SERVICE_URL` del gateway apuntaba a `inventory-service` en vez de `inventory-service-node`.

## Qué se hizo con los 40 puntos originales

Resumen; el detalle punto por punto está en `FACTURACION-BRECHAS.md`.

**Cerrados:** URLs de producción por ambiente y ConfigMap para el switch; `xmlAutorizado` guardado y servido; timeouts en todas las llamadas; SOAP Fault como error reintentable; tabla completa de códigos de IVA sin adivinar; clave de acceso con código estable; fecha de emisión desde el evento en hora de Ecuador; validación aritmética propia; dedupe de reenvíos ("clave ya registrada" → `sent`); vigencia de certificados; backoff exponencial con `next_check_at`; RIDE con QR; consumidor de `billing.invoice.voided`; tarjeta de estado fiscal en la interfaz; RIMPE y contribuyente especial; `productCode` como `codigoPrincipal`; `pagos`/`formaPago`, `dirEstablecimiento`; OTel real; JWT muerto eliminado; `resourceType` correcto para los `.p12`; sin claves de acceso falsas; Service a ClusterIP; límites y probes en billing; API con listado paginado y descargas; 144 tests.

**Abiertos a propósito o por dependencia externa:** validación XSD en tiempo de ejecución (se hace en CI); validador oficial de la firma (necesita autorización real); notas de débito, retenciones y guías (comprobantes nuevos); huecos de secuencial solo detectados, no prevenidos.

## La forma de trabajar que funcionó

Vale la pena repetirla en otros servicios:

1. **Verificar cada afirmación con una ejecución**, no leyendo el código. Las tres cosas rotas a la vez pasaron desapercibidas precisamente por leer.
2. **Capturar respuestas reales del servicio externo** (los Faults de celcer) y convertirlas en fixtures de test.
3. **Verificar con una herramienta independiente**: la firma se comprueba con `xml-crypto`, no con el mismo código que la genera; el XML contra los XSD oficiales con libxml2.
4. **Marcar los fallos abiertos con un test que falla** (`it.fails` / `test.fail`, "FALLO CONOCIDO"): cuando alguien lo arregla, el test avisa y se le quita la marca.
5. **Probar los manifiestos de k8s** como se prueba el código: `k8s-manifests.test.ts` compara las URLs contra los Services reales y caza las tres rotas originales si alguien deshace el arreglo.
