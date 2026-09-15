# Reglas del SRI

[← Facturación electrónica](./README.md) · [Flujo end-to-end](./flujo-end-to-end.md) · [Historial de hallazgos](./historial-hallazgos.md)

Lo que el SRI exige, cómo está implementado y dónde se rompió antes. Todo vive en `backend/fiscal-ecuador/src/domain/`.

## Ambientes y URLs

El ambiente **no es solo un dígito del XML**: cambia también a qué servidor se envía. Los dos tienen que ir juntos o el SRI rechaza todo.

| Ambiente | Dígito | Recepción / Autorización |
|---|---|---|
| Pruebas | `1` | `celcer.sri.gob.ec/comprobantes-electronicos-ws/...` |
| Producción | `2` | `cel.sri.gob.ec/comprobantes-electronicos-ws/...` |

Las URLs salen solas del ambiente (`SRI_ENDPOINTS` en `config.ts`). Las variables `SRI_RECEPTION_URL` / `SRI_AUTHORIZATION_URL` existen solo para apuntar a un simulador, y **si contradicen el ambiente el servicio se niega a arrancar** — el fallo anterior era justo ese: `SRI_ENVIRONMENT=produccion` seguía mandando a celcer.

## Clave de acceso (49 dígitos)

```
[fecha 8][tipo comp 2][RUC 13][ambiente 1][serie 6][secuencial 9][código num 8][tipo emisión 1][verificador 1]
```

| Campo | Contenido |
|---|---|
| Fecha de emisión | `ddmmaaaa`, en hora de Ecuador (ver abajo) |
| Tipo de comprobante | `01` factura, `04` nota de crédito |
| RUC | 13 dígitos del emisor |
| Ambiente | `1` pruebas, `2` producción |
| Serie | código de establecimiento + punto de emisión (6) |
| Secuencial | el número que asignó billing (9, con padding) |
| Código numérico | 8 dígitos, **hash estable del id de billing** |
| Tipo de emisión | `1` normal |
| Verificador | módulo 11 |

El código numérico era `Math.random()` sobre una columna `UNIQUE`: colisiones garantizadas con volumen, y un reintento generaba una clave distinta para el mismo comprobante. Ahora es un **hash del id de billing**: el mismo comprobante produce siempre la misma clave, así que reenviarlo es seguro y el SRI responde "clave ya registrada" (43/45), que se interpreta como `sent` en vez de como error.

## Fechas: America/Guayaquil, no UTC

La fecha de emisión es **legal**. El pod corre en UTC: una factura de las 20:00 en Ecuador salía con la fecha del día siguiente, tanto en la clave de acceso como en `fechaEmision`. Se formatea siempre en `America/Guayaquil` (`domain/ecuador-time.ts`) y la fecha viene del evento (`issueDate`), no del momento en que se procesa.

## Códigos de impuesto (Tablas 16 y 17)

Traducción del catálogo de tax-service a los códigos del SRI, en `domain/sri-tax-codes.ts`:

| Catálogo | `codigoPorcentaje` | Tarifa |
|---|---|---|
| `IVA0` | `0` | 0 |
| `IVA12` | `2` | 12 |
| `IVA14` | `3` | 14 |
| `IVA15` | `4` | 15 |
| `IVA5` | `5` | 5 |
| `NO_OBJETO` | `6` | 0 |
| `EXENTO` / `IVA_EXENTO` | `7` | 0 |
| `IVA_DIFERENCIADO` | `8` | según el caso |
| `IVA13` | `10` | 13 |

Dos reglas que importan:

1. **Lo que no se sabe traducir se rechaza**, con un mensaje. Antes, cualquier código desconocido acababa como IVA 15% y cualquier impuesto que no fuera IVA (ICE, IRBPNR, retenciones) se emitía *también* como IVA: facturas con impuestos falsos.
2. **Sin catálogo solo se deducen tarifas positivas inequívocas** (5, 12, 13, 14, 15). El 0% queda fuera a propósito: puede ser IVA 0%, exento o no objeto de IVA, y cada uno se declara distinto. Si tax-service no responde y la tarifa es 0%, el comprobante espera y se reintenta en vez de inventar un código.

## Validación contra el XSD oficial

El SRI valida el XML contra su esquema al recibirlo; si falla, responde `ARCHIVO NO CUMPLE ESTRUCTURA XML` sin más detalle.

Los XSD oficiales están en `backend/fiscal-ecuador/test-resources/sri-xsd/` (`factura_V2.1.0.xsd`, `notaCredito_V1.1.0.xsd`, `xmldsig-core-schema.xsd`) y el XML generado se valida contra ellos con **libxml2 (`xmllint-wasm`) en CI** — la misma validación que hace el SRI. No es una validación en tiempo de ejecución: es una red de seguridad sobre el generador, que es determinista.

Violaciones concretas que esto cazó y que el SRI habría rechazado:

- `tarifa` salía `"15.00.00"` cuando el porcentaje llegaba como `"15.00"`.
- `codigoPrincipal` era un UUID de 36 caracteres (el máximo es 25).
- `<infoAdicional>` vacío: el esquema exige al menos un campo.
- El orden de los nodos: el esquema es una secuencia y un nodo fuera de sitio invalida el documento.

## Firma XAdES-BES

Firma con el `.p12` de la organización, RSA-SHA256 y canonicalización C14N. **Nunca funcionó hasta el 2026-09-13** y los motivos valen la pena porque cualquiera de ellos se repite fácil:

1. Llamaba a `forge.pki.rsa.sign`, que no existe en node-forge — toda factura con certificado moría con `signer.sign is not a function`. Es `privateKey.sign`.
2. Aun firmando, la firma no habría validado, por cinco diferencias entre lo que se hasheaba y lo que se verifica tras canonicalizar:
   - el digest incluía la declaración `<?xml?>`;
   - un `\n` de más antes de `</factura>`;
   - `xmlns:ec` declarado y sin usar dentro de `SignedInfo`;
   - atributos `URI` / `Type` fuera de orden;
   - la referencia a `SignedProperties` sin transform, con lo que XMLDSig aplica C14N **inclusiva** y no la que se había usado al hashear.

**Cómo se comprueba sin el SRI:** `xml-signer.test.ts` genera un `.p12` con node-forge y verifica la firma con **`xml-crypto`**, un verificador XMLDSig independiente. Que valide con otra librería es la garantía de que no estamos verificando nuestro propio error.

Lo que sigue faltando: el **validador oficial del SRI**. Eso solo se cierra con una autorización real.

## El sobre SOAP

Los web services son "offline" y SOAP. El namespace correcto, según el WSDL real de celcer:

| | Namespace | Elemento |
|---|---|---|
| Recepción | `http://ec.gob.sri.ws.recepcion` | `validarComprobante` |
| Autorización | `http://ec.gob.sri.ws.autorizacion` | `autorizacionComprobante` / `claveAccesoComprobante` |

El código usaba `http://ec.gob.sri.ws.cfactura` y `claveAccesoConsultada`. celcer respondía `SOAP Fault: Unexpected wrapper element` y el parser lo interpretaba como `DEVUELTA`: un rechazo inventado que ocultaba el fallo real. Ahora un Fault es un `SriUnavailableError` reintentable, y una respuesta sin estado reconocible también. Hay tests con respuestas reales de celcer capturadas como fixtures.

Todas las llamadas salientes (SRI, document-service, catálogos) llevan `AbortSignal.timeout`: sin él, una conexión colgada congelaba el consumer.

## Validaciones aritméticas propias

Antes de firmar (`domain/invoice-validation.ts`):

- cantidad > 0, precio y descuento no negativos, descripción presente y ≤ 300 caracteres;
- cada línea con **al menos un impuesto** (el SRI lo exige, aunque sea IVA 0%);
- la base imponible declarada coincide con precio × cantidad − descuento;
- la suma de líneas cuadra con `subtotalCents`, la de impuestos con `taxTotalCents` y el total con `importeTotal`;
- RUC de 13 dígitos, secuencial de 9 dígitos;
- moneda: solo dólares;
- tope de consumidor final ($50): por encima el SRI exige identificar al comprador.

Esta validación es también la que detecta el caso del precio con IVA incluido: si la base no coincide con el precio sin impuestos, el impuesto se estaría cobrando dos veces.

## Secuenciales

- **Duplicados**: índice único `(organization_id, document_type, number)`. Un número repetido en la organización da error explícito, no una fila pisada.
- **Huecos**: se detectan y se publica `sequence_gap`; hay endpoint `GET /fiscal-invoices/sequence-gaps`. Un hueco significa que hay un comprobante emitido comercialmente cuyo evento no se procesó, así que el SRI no lo conoce. Billing serializa la numeración con `FOR UPDATE`, pero eso no impide que un evento se pierda.

## RIDE y su QR

PDF tributario generado al vuelo (`pdfkit` + `qrcode`) para comprobantes autorizados. Lleva emisor, comprador, líneas, totales, número de autorización, fecha y el QR.

⚠️ **El contenido exacto del QR lo define la Ficha Técnica ANEXO 2**, que no se pudo consultar. Hoy codifica la URL del portal de consulta del SRI con la clave de acceso precargada (`RIDE_QR_URL`, con default por ambiente), que es la convención habitual del ecosistema ecuatoriano. Es configurable justo para corregirlo en un solo lugar cuando se confirme.

## Perfil fiscal del emisor

Vive en `organization.settings` (JSON libre, sin cambios en organization-service) y se edita en Ajustes → Organización: RIMPE, contribuyente especial, agente de retención, dirección matriz y forma de pago por defecto. Fiscal lo lee al emitir y lo vuelca en el XML (`contribuyenteRimpe`, `contribuyenteEspecial`, `agenteRetencion`, `dirMatriz`, `dirEstablecimiento`).

Si organization-service o tax-service no responden, **no se factura a ciegas**: antes fiscal los llamaba sin cabeceras internas, recibía 401 y 403 y emitía sin catálogo de IVA ni datos RIMPE sin avisar a nadie.
