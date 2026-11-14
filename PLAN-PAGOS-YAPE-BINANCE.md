# VortexGamer — Plan de pagos automáticos (SOLO DOCUMENTACIÓN, no habilitado)

## Recorrido deseado

1. Cliente introduce UID de Free Fire y servidor consulta verificador autorizado.
2. Servidor asocia UID verificado a una sesión temporal. El nombre se presenta para confirmación.
3. Cliente elige uno de los seis paquetes y pulsa **Pagar**.
4. Servidor crea pedido PENDIENTE con identificador único y precio recalculado del catálogo del servidor (nunca confiar en el importe del navegador).
5. Cliente elige **Yape** o **Binance Pay**; un proveedor habilitado devuelve un checkout seguro o QR dinámico para ESE pedido.
6. VortexGamer valida por API y/o webhook firmado el estado del pago, orden, monto, moneda y antirepetición.
7. Solo tras confirmación inequívoca y registro transaccional del pago, crea la solicitud de recarga a Recargas América y guarda el ID externo para seguimiento.
8. El pedido pasa de pendiente de pago → pagado → recarga pendiente → completada / error revisable. No repetir automáticamente llamadas con posible cargo duplicado.

## Yape automático

Una imagen de QR personal/estático NO da a la web confirmación de que se realizó el pago. Se necesita pasarela habilitada compatible con Yape (por ejemplo, Culqi o Mercado Pago), con claves del comercio y comprobación segura del resultado.

**Opción Yape con QR de billeteras móviles — Culqi Online:**
- Documentación: https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles/
- QR dinámico por orden, evento webhook `order.status.changed`.
- Según la documentación consultada, los pagos QR de billeteras móviles tienen mínimo **S/ 6** y máximo **S/ 500**. Por tanto, el paquete de **S/ 3.50** NO puede usar ese canal QR específico.
- Verificar condiciones, comisiones y habilitación contractual del comercio antes de integrar.

**Alternativa Yape con código de aprobación (OTP):**
- https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape
- https://www.mercadopago.com.pe/developers/es/docs/checkout-api-orders/payment-integration/websites/yape?scope=prod
- El cliente utiliza el flujo del proveedor con número/código generado en Yape. Es diferente a pagar escaneando un QR.
- El token y el cargo deben procesarse por los flujos aprobados del proveedor; no almacenar OTP ni credenciales de cliente en nuestra base de datos.

## Binance Pay

- https://merchant.binance.com/en/docs/functionalities/single-payment/native-apis
- La API Merchant crea la orden, retorna QR/enlace de checkout.
- Validar webhooks/certificados/firmas y consultar estado antes de aprobar.
- Fuente: https://merchant.binance.com/en/docs/functionalities/webhooks
- Requiere cuenta Merchant habilitada y condiciones aplicables. No reutilizar dirección de depósito personal como confirmación automática.

## Cloudflare (arquitectura segura)

- Frontend: Cloudflare Pages, archivos en `public/`.
- Backend: Pages Functions dentro de `functions/` para órdenes, pagos y webhooks.
- Datos: Cloudflare D1 con pedidos, usuario, UID, eventos, identificadores del proveedor, importes originales, estado y bitácora de auditoría.
- Secretos: variables cifradas configuradas en Cloudflare; NUNCA guardar claves de Yape/Culqi/Mercado Pago/Binance/Recargas América en GitHub o HTML público.
- Validación: firmas y replay protection, timestamps, idempotencia, montos en céntimos, reintentos controlados, control de acceso del administrador, límite de peticiones.
- API Recargas América: esperar documentación oficial de endpoints, productIDs, autenticación, consulta de pedidos y webhooks. Sin documentación no se efectúan recargas reales.
- Hasta completar lo anterior, interfaz de checkout deshabilitada: NO muestra QR cobrable, NO acepta pagos y NO marca órdenes como pagadas.

## Modo vista previa de esta rama

La rama `preview/gamer-aura-v2` permite simular validación del flujo sin consultar Free Fire: está **explícitamente marcada como DEMO**. El botón **Pagar** solo abre un resumen con pestañas Yape/Binance y aviso de que las opciones no aceptan dinero. Este estado no puede pasar a producción real sin pruebas de seguridad, credenciales y webhook.
