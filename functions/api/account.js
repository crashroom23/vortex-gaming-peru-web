const previewHost = 'preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev';
const cookieName = '__Host-vortex-session';
const sessionSeconds = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
export const randomHex = (size) => hex(crypto.getRandomValues(new Uint8Array(size)));
const digest = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

function reply(body, status = 200, token) {
  const headers = new Headers({'Cache-Control': 'no-store'});
  if (token !== undefined) {
    headers.set('Set-Cookie', cookieName + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' +
      (token ? sessionSeconds : 0));
  }
  return Response.json(body, {status, headers});
}

export async function hashPassword(password, salt, pepper) {
  const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const prehash = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(password));
  const key = await crypto.subtle.importKey('raw', prehash, 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000
  }, key, 256));
}

function equalHash(left, right) {
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function takeAttempt(db, scope, now, limit) {
  const result = await db.prepare(`
    INSERT INTO preview_auth_attempts (scope, expires_at, count) VALUES (?, ?, 1)
    ON CONFLICT(scope) DO UPDATE SET
      count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= ? OR count < ?
    RETURNING count
  `).bind(scope, now + 900, now, now, now, limit).first();
  return Boolean(result);
}

export async function readSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? await digest(token) : null;
}

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  if (url.hostname !== previewHost) return reply({message: 'Ruta no disponible.'}, 404);

  const method = request.method;
  if (!['GET', 'POST', 'DELETE'].includes(method)) return reply({message: 'Método no permitido.'}, 405);
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return reply({message: 'Origen no permitido.'}, 403);
  }

  const db = env.ORDERS_DB;
  const pepper = env.PREVIEW_ACCOUNT_PEPPER;
  if (!db || typeof pepper !== 'string' || pepper.length < 32) {
    return reply({message: 'El acceso a cuentas aún no está habilitado en esta vista previa.'}, 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await readSessionToken(request);

  try {
    if (method === 'GET') {
      const session = tokenHash && await db.prepare(
        'SELECT username FROM preview_sessions WHERE token_hash = ? AND expires_at > ?'
      ).bind(tokenHash, now).first();
      return reply({username: session?.username ?? null});
    }

    if (method === 'DELETE') {
      if (tokenHash) await db.prepare('DELETE FROM preview_sessions WHERE token_hash = ?').bind(tokenHash).run();
      return reply({username: null}, 200, '');
    }

    if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
      return reply({message: 'Formato de solicitud inválido.'}, 415);
    }
    const payload = await request.text();
    if (payload.length > 2048) return reply({message: 'Solicitud demasiado larga.'}, 413);
    let body;
    try {
      body = JSON.parse(payload);
    } catch {
      return reply({message: 'Solicitud inválida.'}, 400);
    }

    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = body?.password;
    const action = body?.action;
    if (!['register', 'login'].includes(action) || !/^[a-z0-9_]{3,24}$/.test(username) ||
        typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return reply({message: 'Usa un usuario de 3 a 24 letras, números o guiones bajos y una contraseña de 6 a 128 caracteres.'}, 400);
    }

    const clientHash = await digest(pepper + ':' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
    if (!await takeAttempt(db, 'client:' + clientHash, now, 20) ||
        !await takeAttempt(db, 'user:' + username, now, 8)) {
      return reply({message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.'}, 429);
    }

    const sessionToken = randomHex(32);
    const statements = [
      db.prepare('DELETE FROM preview_sessions WHERE expires_at <= ?').bind(now),
      db.prepare('DELETE FROM preview_auth_attempts WHERE expires_at <= ?').bind(now)
    ];
    const sessionHash = await digest(sessionToken);
    const sessionExpiry = now + sessionSeconds;

    if (action === 'register') {
      const salt = randomHex(16);
      const passwordHash = await hashPassword(password, salt, pepper);
      statements.push(db.prepare(
        'INSERT INTO preview_accounts (username, salt, password_hash) VALUES (?, ?, ?) ON CONFLICT(username) DO NOTHING'
      ).bind(username, salt, passwordHash));
      statements.push(db.prepare(
        'INSERT INTO preview_sessions (token_hash, username, expires_at) SELECT ?, username, ? FROM preview_accounts WHERE username = ? AND salt = ?'
      ).bind(sessionHash, sessionExpiry, username, salt));
      const result = await db.batch(statements);
      if (!result.at(-1).meta.changes) return reply({message: 'Ese nombre de usuario ya está en uso.'}, 409);
    } else {
      const user = await db.prepare(
        'SELECT salt, password_hash FROM preview_accounts WHERE username = ?'
      ).bind(username).first();
      const passwordHash = await hashPassword(password, user?.salt ?? '0'.repeat(32), pepper);
      if (!equalHash(passwordHash, user?.password_hash ?? '0'.repeat(64)) || !user) {
        return reply({message: 'Usuario o contraseña incorrectos.'}, 401);
      }
      statements.push(db.prepare(
        'INSERT INTO preview_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)'
      ).bind(sessionHash, username, sessionExpiry));
      await db.batch(statements);
    }

    if (tokenHash) await db.prepare('DELETE FROM preview_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return reply({username}, action === 'register' ? 201 : 200, sessionToken);
  } catch {
    return reply({message: 'El acceso a cuentas no está disponible en este momento.'}, 503);
  }
}
