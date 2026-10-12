VORTEX GAMING PERÚ — PÁGINA WEB LISTA PARA SUBIR
================================================

Esta es una página web básica con estilo gamer para Vortex Gaming Perú y un formulario para verificar UID/nickname de Free Fire. El formulario ya está conectado al backend dentro de la misma aplicación.

IMPORTANTE: la página visual está lista, pero la consulta real de Free Fire necesita una clave API válida y un hosting que ejecute Node.js. No pongas tu clave en public/index.html ni la compartas.

REQUISITOS
- Hosting compatible con Node.js 18 o superior.
- HTTPS en producción.
- Cuenta/clave válida del proveedor de API.
- La API del proveedor debe permitir consultas al endpoint configurado y tu plan debe permitir producción.

INSTALACIÓN EN UN HOSTING NODE.JS
1. Sube y descomprime el contenido del ZIP en la carpeta de la aplicación.
2. En el panel del hosting, crea una aplicación Node.js usando Node 18+.
3. Ejecuta `npm install`.
4. Copia `.env.example` como `.env`, o configura las mismas variables en el panel del hosting.
5. En `FREE_FIRE_API_KEY`, pega tu clave API SOLO en el panel privado del servidor. Nunca la pongas en el HTML.
6. Revisa `APP_USER_AGENT` y actualiza el dominio cuando tengas uno.
7. Ejecuta `npm start` (o configura el comando de inicio `node server.js`).
8. Abre la URL HTTPS de tu web. La página debe mostrar el diseño y el formulario.
9. Prueba `/api/health`; debe devolver JSON e indicar si la clave está configurada.
10. Prueba el formulario con un UID que tengas permiso de consultar.

VARIABLES
PORT=3000
FREE_FIRE_API_KEY=tu_clave_privada
FREE_FIRE_API_BASE_URL=https://developers.freefirecommunity.com/api/v1
FREE_FIRE_REGION=br
APP_USER_AGENT=VortexGamingPeru/1.0 (+https://tu-dominio.com)

REGIÓN
BR/LATAM aparece seleccionada por defecto como punto de partida. No se garantiza que funcione para todas las cuentas peruanas; prueba un UID válido y cambia la región si la cuenta pertenece a otra región compatible.

ERRORES COMUNES
- “Falta configurar la clave”: configura FREE_FIRE_API_KEY en el entorno del servidor y reinicia.
- “La API rechazó la consulta”: comprueba la clave, el plan, el User-Agent y las reglas del proveedor.
- “No se encontró el nombre esperado”: puede ser UID incorrecto, región incorrecta o una respuesta distinta del proveedor.
- “Demasiadas consultas”: se activó el límite local de 20 solicitudes por minuto por IP.
- No funciona en un hosting de archivos estáticos: este proyecto necesita Node.js porque contiene un backend. No basta con subir solo index.html.

SEGURIDAD
- `.env` está incluido en `.gitignore`; no lo publiques en repositorios.
- Usa siempre HTTPS.
- No se incluye ninguna clave API real.
- El paquete no se ha probado con tu clave ni con un UID real, por lo que debes verificarlo tras instalarlo.
- El plan gratuito del proveedor puede ser solo de prueba; confirma las condiciones actuales antes de usarlo con clientes.

ESTRUCTURA
public/index.html — página web
server.js — backend y endpoint de verificación
package.json — dependencias y comando de inicio
.env.example — ejemplo de configuración privada
