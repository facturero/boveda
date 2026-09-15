# Pendientes y riesgos

[← Facturación electrónica](./README.md) · [Operación](./operacion.md) · [Historial de hallazgos](./historial-hallazgos.md)

Estado al **2026-09-14**. Ordenado por lo que bloquea antes.

## 1. Trabajo terminado que nunca se subió

Lo más urgente, porque son cambios ya escritos y probados que están solo en el disco de la máquina de desarrollo. Los 144 tests de fiscal pasan con ellos.

| Repo | Sin commitear |
|---|---|
| `backend/fiscal-ecuador` | RIDE completo: `domain/ride-pdf.ts`, `domain/ride-qr.ts`, `GET /fiscal-invoices/:id/ride`, `ride_available` en el DTO, 6 tests, `pdfkit` + `qrcode` |
| `frontend` | Botón de RIDE, **pantalla de nota de crédito**, división de `InvoiceFormView` (691 → 260 líneas) en 6 componentes, `invoice-form.spec.ts` |
| `backend/auth-service` | Migración que describe el permiso `invoice:authorize` |

**Consecuencia real:** billing y fiscal ya tienen la **nota de crédito desplegada**, pero nadie puede emitirla porque la pantalla no se ha subido. Lo mismo con el RIDE, que además necesita su backend. Es commit + push; el CI despliega solo.

## 2. Nunca se ha conseguido una autorización real del SRI

**Esto no es código.** Hace falta:

- un **RUC registrado** como emisor electrónico en el ambiente de pruebas (`SRI_E2E_RUC`);
- un **certificado emitido por una entidad acreditada**.

Con el `.p12` autofirmado que usan los tests, el SRI llega a validar el contribuyente y rechaza — el camino técnico se ejercita entero salvo el sello final. Hasta que esto se resuelva:

- no hay ningún comprobante con validez legal emitido por el sistema;
- queda abierta la validación de la firma XAdES contra el **validador oficial del SRI** (hoy está verificada con `xml-crypto`, un verificador XMLDSig independiente, que es una garantía fuerte pero no la oficial);
- no tiene sentido pasar a producción.

El paso a producción en sí es un ConfigMap de una línea, ver [operación](./operacion.md).

## 3. Comprobantes que no existen

Solo se emiten **factura (`01`)** y **nota de crédito (`04`)**. Cada uno de los que faltan es un comprobante nuevo: su propio XSD, su builder de XML, su secuencia y su pantalla.

| Comprobante | Código | Nota |
|---|---|---|
| Comprobante de retención | `07` | El que más suele pedirse en cuanto hay proveedores |
| Nota de débito | `05` | |
| Guía de remisión | `06` | Solo si hay transporte de mercadería |

`tax-service` ya los cataloga; nadie los construye.

## 4. Menores, pero anotados

- **Contenido del QR del RIDE**: se asumió la URL de consulta del SRI con la clave precargada. Falta contrastarlo con la **Ficha Técnica ANEXO 2**. Es configurable (`RIDE_QR_URL`) justo para corregirlo en un sitio.
- **`codigoAuxiliar`** no se emite; solo `codigoPrincipal` (el SKU).
- **Huecos de secuencial**: se detectan y se avisa (`sequence_gap`, endpoint `GET /fiscal-invoices/sequence-gaps`), pero billing no los previene más allá de serializar la numeración con `FOR UPDATE`. Un hueco significa un comprobante emitido comercialmente cuyo evento no llegó a fiscal.
- **Descarga pública de archivos**: los certificados y comprobantes fiscales ya están cerrados (404 para `fiscal_certificate`, `fiscal_invoice` y cualquier `application/x-pkcs12`), y los archivos se acotan por organización. Las **imágenes** siguen siendo públicas por id, porque la interfaz las pinta con `<img src>` sin token. Cerrarlo del todo obliga a cambiar cómo descarga el frontend.
- **`InvoiceFormView`** quedó dividido, pero el refactor va en el lote sin subir.

## 5. Decisiones tomadas a propósito (no son deuda)

Anotadas para no volver a discutirlas:

- **País ≠ EC se ignora en silencio.** El exchange de eventos es compartido y este servicio es solo de Ecuador; que vea pasar facturas de otros países es normal.
- **El XSD se valida en CI, no en tiempo de ejecución.** El generador es determinista: validar cada comprobante en caliente cuesta y no añade información que los tests no den antes.
- **El RIDE se genera al vuelo y no se guarda.** Se puede reconstruir siempre desde `original_payload` más la autorización; guardarlo obliga a versionarlo cuando cambie el diseño.
- **`fiscal:manage` sigue valiendo para reintentar**, aunque el permiso propio sea `invoice:authorize`: separar sin quitarle acceso a quien ya lo tenía.

## Riesgo de fondo

Lo que hizo falsa la primera lista de brechas: **en producción hay 0 facturas fiscales y 0 certificados**. El flujo nunca se había ejercitado, así que nada de lo que estaba roto se veía — la firma, el sobre SOAP y las URLs internas estaban rotas a la vez y el sistema parecía funcionar. Mientras no haya un emisor real usándolo, cualquier afirmación sobre "esto ya funciona" tiene que venir de un test que lo ejecute, no de leer el código.
