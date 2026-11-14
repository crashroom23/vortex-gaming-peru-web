# Integración Recargas América — VortexGamer (rama de prueba)

Esta integración usa la colección Postman entregada por el propietario. **NO contiene ni almacena la clave de API**. Los pagos y la compra real continúan **deshabilitados**. No activar ventas por estas funciones hasta tener webhooks verificados de Yape/Binance Pay, base de datos e idempotencia.

## Seguridad inmediata

El archivo Postman adjuntado contenía una credencial de **producción** (prefijo `ra_`). Recomendamos **revocar/rotar esta clave** en Recargas América → **API para Desarrolladores → Mis Claves API** y emitir otra. No copiar credenciales a GitHub ni al navegador.

Para probar, crea una **clave sandbox** (prefijo `ra_test_`) que no descuenta saldo ni genera recargas reales. Los productos del catálogo sí devuelven IDs reales.

## Configurar Cloudflare Pages — solo entorno Preview al principio

Abre: Cloudflare → Workers & Pages → `vortex-gaming-peru-web` → Settings → Variables and Secrets (a veces figura como Environment Variables).

Para el entorno **Preview** configura:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `RA_API_KEY` | **Secret** (cifrado) | Clave **sandbox** nueva, no la clave de producción enviada en el archivo |
| `RA_FF_PRECHECK_PRODUCT_ID` | Variable opcional | `5` (paquete Free Fire 100+10 del catálogo real; predeterminado en el código, pendiente de confirmar soporte de precheck) |
| `RA_VALIDATE_ENABLED` | Variable | `false` hasta instalar medidas antiabuso y verificar el producto elegido |

Reinicia/redeploy la versión Preview para aplicar variables. **No configurar la clave de producción ni habilitar `RA_VALIDATE_ENABLED` hasta probar antiabuso/controles de cuotas.**

## Fase de prueba de UID con Cloudflare Turnstile

**Estado del código:** ya existe la integración cliente/servidor. **No está habilitada automáticamente**: faltan crear y guardar las credenciales de Turnstile en Cloudflare Preview y escoger el UID específico de prueba.

1. En Cloudflare → **Turnstile** → Add widget, crear un widget para el hostname de la web Preview (por ejemplo `preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev`). Anotar por separado su **sitekey público** y su **secret privado**.
2. En Cloudflare → Workers & Pages → `vortex-gaming-peru-web` → Settings → **Preview** → Variables and secrets, mantener `RA_API_KEY` como Secret y crear:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `RA_TURNSTILE_SITE_KEY` | Variable (pública) | Sitekey del widget Cloudflare Turnstile |
| `RA_TURNSTILE_SECRET` | **Secret** | Secret del mismo widget (nunca en GitHub) |
| `RA_VALIDATE_TEST_UID` | Variable | UID propio elegido para probar, **8 a 12 dígitos** |
| `RA_VALIDATE_ENABLED` | Variable | `true` solo cuando todo esté configurado y se quiera hacer una prueba |
| `RA_FF_PRECHECK_PRODUCT_ID` | Variable opcional | `5` (paquete Free Fire 100 + 10); pendiente de comprobar precheck real |

3. Redeploy de la rama `preview/gamer-aura-v2`. Verificar `/api/recargas/health`: `catalogConfigured:true`, `turnstileConfigured:true`, `validationReady:true`, `purchasesEnabled:false`.
4. En la web Preview, introducir **solo el UID permitido** en `RA_VALIDATE_TEST_UID`, completar Turnstile y pulsar **Verificar UID**. El servidor valida token, hostname y acción `ff_uid` en **Siteverify** antes de llamar al proveedor con `{ product_id:5, service_user_id:UID }`. Nunca compartir la clave privada.
5. Si el proveedor responde `supported:false`, el producto no soporta precheck y **no se debe presentar una verificación exitosa**. Si el proveedor responde error o `status:false`, igualmente no se declara verificado el UID.
6. Para apagar de inmediato: poner `RA_VALIDATE_ENABLED=false` en Preview y redeploy. **No habilitar la verificación pública para todos los jugadores** en esta fase: falta WAF/Rate Limiting duradero en Cloudflare o control de cuota mediante almacenamiento compartido. Turnstile no sustituye las cuotas de solicitudes.

El endpoint responde `503 NOT_READY` si falta la clave de Recargas América, Turnstile, UID de prueba o bandera de activación. Responde `403 TEST_ONLY` para otros UID, y `403 CHALLENGE_REQUIRED` si no incluye token. No contiene llamadas a `/buy/catalog` ni procesamientos de pagos. La clave usada en pruebas no se debe mostrar en capturas o chats.

## Rutas creadas

- `GET /api/recargas/health`: informa si la API está configurada, sin exponer claves ni saldo.
- `GET /api/recargas/catalog`: consulta catálogo de Recargas América y retorna solo ID/SKU/nombre/campos requeridos de Free Fire. Oculta los precios mayoristas. Incluye caché de 5 minutos si Cloudflare admite Cache API.
- `POST /api/recargas/validate`: recibe `{ "uid": "123456789" }` y llama a `POST /catalog/validate`. Se mantiene **desactivado por defecto** hasta configurar Turnstile, UID de prueba y activación explícita. El UID debe tener de 8 a 12 dígitos. Si el proveedor indica `supported:false`, se devuelve `verified:false` y NO se afirma que la cuenta fue verificada.
- `/api/recargas/buy`: **siempre responde 403 PURCHASES_DISABLED** y no llama a `POST /buy/catalog`.

La web intenta primero la validación de Recargas América cuando esté habilitada. Si no está configurada, conserva el verificador de Free Fire independiente si dispone de su propia clave. En los demás casos permite únicamente el modo de demostración.

**La región "Sur LATAM" en la interfaz es una elección de la tienda**; `/catalog/validate` valida el UID para un `product_id` concreto y no acredita que la cuenta pertenece específicamente a Sur LATAM. Elegir el producto compatible con la región corresponde al catálogo real del proveedor.

## Cuándo implementar compras reales

Se requiere:

1. Los seis paquetes ya tienen **product_id** exacto según el catálogo real; falta comprobar **moneda/precio de costo** para determinar márgenes y prevenir ventas con pérdidas.
2. Integrar Yape y Binance Pay con un proveedor aceptado, creando órdenes únicas en una base de datos Cloudflare D1 y **confirmando el pago en el servidor**. Nunca basarse en un QR personal o en una captura sin validación.
3. Proteger la validación de UID con cuotas, controles de abuso y opcionalmente Cloudflare Turnstile.
4. Al recibir confirmación auténtica e idempotente del pago, generar una orden interna única, `Idempotency-Key` nueva y permanente para dicha orden; y solo entonces llamar `POST /buy/catalog`.
5. Guardar `order_id`, `transaction_id`, `Idempotency-Key` y el estado original para consultar `GET /catalog/orders/{order_id}`.
6. Ante `409 DUPLICATE_REQUEST`, seguir la orden original, **nunca** disparar otra compra.
7. Ante `502 PROVIDER_ERROR`, distinguir entre `needs_review:true` (no reintentar) y `REFUNDED_API_ERROR` (saldo devuelto). Para `PROCESSING_PROVIDER` continuar consulta sin repetir la compra.
8. Verificar restricciones de lista de IPs: las Cloudflare Pages Functions pueden utilizar direcciones de salida variables. Recargas América recomienda un proxy con IP estática si se habilita una lista de IPs.
9. Evaluar que el monto mínimo de Yape vía QR del proveedor de cobro cubra los paquetes baratos; no prometer QR automático para S/ 3.50 si el método no lo admite.


## Catálogo auténtico recuperado (14-11-2026)

La respuesta real de `GET /api/recargas/catalog` confirmó estos productos Free Fire:

| Paquete VortexGamer | Product ID de Recargas América | SKU |
| --- | ---: | --- |
| 100 + 10 diamantes | 5 | ADS005 |
| 310 + 31 diamantes | 6 | ADS006 |
| 520 + 52 diamantes | 7 | ADS007 |
| 1060 + 106 diamantes | 8 | ADS008 |
| 2180 + 218 diamantes | 9 | ADS009 |
| 5600 + 560 diamantes | 10 | ADS010 |

Este mapeo queda registrado en `public/vortex.js` como `providerProductId` y `providerSku`. No implica comprar automáticamente. Los precios públicos en soles siguen definidos por VortexGamer. **El catálogo público filtrado no contiene precio de costo del proveedor**, así que todavía no se ha comprobado margen ni conversión de divisa.

Para `POST /catalog/validate`, el producto predeterminado es **5** (100 + 10). Se puede sobrescribir con `RA_FF_PRECHECK_PRODUCT_ID`. `RA_VALIDATE_ENABLED` continúa por defecto desactivado; no activar hasta implementar cuotas y medidas antiabuso y confirmar que el producto realmente soporta precheck. No se ha realizado validación real de UID ni orden de compra.

Los otros productos observados (Pase Booyah, tarjeta semanal y mensual) **no se añadieron**: el catálogo de VortexGamer conserva únicamente los seis paquetes elegidos.

## API utilizada

Base: `https://panel.recargasamerica.com/api/v1`

- `GET /wallet` (saldo mayorista **no expuesto** a visitantes)
- `GET /products/catalog`
- `POST /catalog/validate`
- `POST /buy/catalog` (**bloqueado en esta etapa**)
- `GET /catalog/orders/{order_id}` (por implementar con autenticación por pedido)

Colección original y manual entregados por el propietario. La clave del archivo NO se subió al repositorio. Mantener `main` intacta hasta que todas las pruebas estén aprobadas.

## Redespliegue de comprobación

Se solicitó un nuevo despliegue automático de Preview después de configurar las variables en Cloudflare. Este cambio de documentación no afecta el código ni habilita compras. Si `/api/recargas/health` sigue indicando `catalogConfigured:false`, revisar que `RA_API_KEY` exista en Settings → Preview → Variables and secrets y guardar allí la clave **rotada**, nunca en Production solamente.

### Aplicar Turnstile al despliegue de prueba

Si `/api/recargas/health` omite `turnstileConfigured`, el despliegue corresponde a una versión anterior a la integración. Despliega el commit más reciente de `preview/gamer-aura-v2` para aplicar la configuración y comprueba que `purchasesEnabled` siga en `false`.
