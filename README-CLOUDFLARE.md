# VortexGamer: alojamiento gratuito en Cloudflare Pages

Este repositorio incluye una pagina estatica en `public/` y una API adaptada a Cloudflare Pages Functions en `functions/`. El antiguo `server.js` de Node/Express se mantiene para no romper el proyecto previo, pero **Cloudflare Pages no lo ejecuta**.

## Publicar con GitHub + Cloudflare Pages

1. Entra en https://dash.cloudflare.com y crea tu cuenta gratuita si aun no tienes.
2. Abre **Workers & Pages** > **Crear aplicacion** > **Pages** > **Conectar con Git**.
3. Autoriza GitHub y escoge el repositorio `crashroom23/vortex-gaming-peru-web`.
4. Rama de produccion: `main`.
5. Framework: **None** (ninguno). Build command: **vacio**. Build output directory: `public`.
6. Publica. Cloudflare te entregara un subdominio terminado en `pages.dev`.
7. Abre `https://TU-SUBDOMINIO.pages.dev/api/health` para verificar la API.

A partir de entonces, al guardar cambios en `main`, Cloudflare crea una nueva version automaticamente. Las ramas de vista previa pueden mostrarse antes de publicar.

## Verificar Free Fire por UID (independiente de Recargas America)

La interfaz consulta `GET /api/freefire/verify?uid=123456789&region=br`. Para habilitar la consulta real, en Cloudflare Pages configura **Settings > Variables and Secrets** (o **Environment variables** segun la interfaz):

- `FREE_FIRE_API_KEY`: secreto del servicio Free Fire Community. **Nunca pegues la clave en GitHub, HTML ni en conversaciones**.
- `FREE_FIRE_API_BASE_URL`: opcional, valor por defecto `https://developers.freefirecommunity.com/api/v1`.
- `FREE_FIRE_REGION`: opcional, por defecto `br` (no garantiza compatibilidad con Peru).
- `APP_USER_AGENT`: opcional, ajustalo si el proveedor lo exige.

Configura secretos en el entorno **Production** y, si corresponde, en **Preview**. Vuelve a desplegar tras cambiarlos.

**Limitaciones actuales:** la consulta requiere clave y plan validos del proveedor. No hay garantia de que esta API de terceros funcione para todas las regiones o permita uso comercial. Antes de uso publico, agregar proteccion contra abuso (Cloudflare WAF/rate limiting, Turnstile si aplica).

## Catalogo y pagos

Los seis productos y precios se muestran como **catalogo de demostracion**. Sus botones no cobran, no guardan pedidos y no descuentan saldo.
Aun no hay registro/login, billetera, aprobacion de Yape ni compras reales.

## Integrar Recargas America cuando tengamos su documentacion oficial

- Obtener URL base, autenticacion, lista de productos y codigos, consulta de precios, creacion de orden, estados y webhooks.
- Enviar solicitudes desde **Pages Functions**, nunca desde el navegador. Guardar credenciales en los secretos del proyecto.
- Crear base de datos **Cloudflare D1** para usuarios, movimientos de saldo y pedidos, con transacciones y controles de idempotencia para evitar cobros o recargas duplicados.
- Implementar aprobacion de Yape, validacion administrativa, permisos, registros de auditoria, reconciliacion y pruebas completas antes de habilitar compras.
- No asumir que la API es compatible sin verificarla.

## Futuras ediciones por ChatGPT

El repositorio GitHub conectado permite revisar y editar codigo. Si Cloudflare esta vinculado a este repositorio, la publicacion se actualiza con los cambios confirmados. Verifica cada vista previa antes de hacerla publica.
