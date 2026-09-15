# Facturación electrónica (SRI Ecuador)

[← Volver al índice](../README.md) · [billing-service](../servicios/billing-service.md) · [fiscal-ecuador](../servicios/fiscal-ecuador.md)

> **A diferencia del resto de esta bóveda, esto NO es solo diseño.** Documenta lo que hay construido y desplegado, lo que falta y por qué las cosas son como son. Última revisión completa: **2026-09-14**.

## En una frase

Billing emite el comprobante comercial y publica un evento; `fiscal-ecuador` lo convierte en XML del SRI, lo firma con el certificado `.p12` de la organización, lo envía a los web services del SRI, espera la autorización y deja disponible el XML autorizado y el RIDE en PDF. Si algo necesita a una persona, suena la campana del CRM.

## Estado hoy (2026-09-14)

| Pieza | Estado |
|---|---|
| Factura (`01`) end-to-end: XML → firma → envío → autorización | ✅ construido y desplegado |
| Nota de crédito (`04`) | ✅ backend desplegado · ⚠️ **la pantalla está sin subir** |
| RIDE (PDF tributario con QR) | ⚠️ **terminado en local, sin commitear** |
| XML validado contra los XSD oficiales del SRI | ✅ en CI (`xmllint-wasm`) |
| Firma XAdES-BES verificada | ✅ con `xml-crypto` (verificador independiente) · ❌ nunca contra el validador oficial |
| Autorización REAL del SRI (un comprobante AUTORIZADO) | ❌ **nunca se ha conseguido**: falta RUC registrado y certificado acreditado |
| Ambiente | `pruebas` (celcer). Producción es un ConfigMap de una línea, ver [operación](./operacion.md) |
| Retención (`07`), nota de débito (`05`), guía de remisión (`06`) | ❌ no existen |

**Lo que esto significa:** el camino técnico está completo y probado de punta a punta contra el ambiente de pruebas del SRI, pero **todavía no se ha emitido un comprobante con validez legal**, porque eso depende de un trámite (RUC + certificado acreditado), no de código. Ver [pendientes y riesgos](./pendientes-y-riesgos.md).

## Mapa de estos documentos

- [Flujo end-to-end](./flujo-end-to-end.md) — el recorrido completo servicio por servicio, los contratos de evento, la máquina de estados y los reintentos.
- [Reglas del SRI](./reglas-sri.md) — clave de acceso, XSD, códigos de impuesto, firma XAdES-BES, fechas, RIDE/QR. Lo que el SRI exige y dónde está implementado.
- [Operación](./operacion.md) — configuración, secretos, orden de despliegue, cómo verificarlo y cómo pasar a producción.
- [Pendientes y riesgos](./pendientes-y-riesgos.md) — qué falta, priorizado, y qué se decidió no hacer.
- [Historial de hallazgos](./historial-hallazgos.md) — la auditoría del 2026-09-13/14: qué estaba roto, por qué nadie lo había visto y cómo se arregló. Explica muchas decisiones del código.

## Servicios implicados

| Servicio | Papel |
|---|---|
| [billing-service](../servicios/billing-service.md) | Emite el comprobante comercial, asigna el secuencial, publica `billing.invoice.issued` |
| [fiscal-ecuador](../servicios/fiscal-ecuador.md) | Todo lo fiscal: XML, clave de acceso, firma, SRI, RIDE |
| [tax-service](../servicios/tax-service.md) | Catálogo de tarifas de IVA y tipos de comprobante por país |
| [organization-service](../servicios/organization-service.md) | Perfil del emisor: RUC, dirección matriz, RIMPE, contribuyente especial, establecimientos |
| [customer-service](../servicios/customer-service.md) | Datos del comprador y **el código** de su tipo de identificación |
| [document-service](../servicios/document-service.md) | Guarda el `.p12`, el XML firmado y el XML autorizado |
| [notification-service](../servicios/audit-log-service.md) + [api-gateway](../servicios/api-gateway.md) | La campana: avisa cuando un comprobante necesita a una persona |

## Principio que lo ordena todo

**Billing no sabe que el SRI existe.** Si el SRI se cae, o si el comprobante se rechaza, la facturación comercial sigue funcionando. El ciclo comercial (`draft → issued → voided`) y el fiscal (`pending → sent → authorized/rejected`) son independientes y pueden discrepar: una factura puede estar emitida comercialmente y rechazada fiscalmente. Ver [estrategia multipaís](../arquitectura/estrategia-multipais.md).
