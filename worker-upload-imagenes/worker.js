/**
 * worker-upload-imagenes/worker.js
 * ---------------------------------------------------------------------
 * Cloudflare Worker que autoriza subir/borrar imágenes en el bucket de
 * R2 compartido entre todos los criadores.
 *
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR (endurecimiento):
 *
 * 1. AISLAMIENTO POR CRIADOR. Antes solo se confirmaba "esta persona
 *    tiene una sesión válida de Supabase" y el navegador decidía la ruta
 *    (`path`). Cualquier usuario autenticado podía sobrescribir o borrar
 *    las fotos de otro criador. Ahora el Worker consulta `perfiles_admin`
 *    con el token DEL PROPIO USUARIO (así RLS aplica) para saber a qué
 *    criador pertenece, y solo permite tocar `<slug>/ejemplares/`.
 *    Requiere la política "Cada quien lee su propio criador" de
 *    sql/endurecimiento_seguridad.sql; sin ella el Worker responde 403.
 *
 * 2. CRIADOR ACTIVO. Si `criadores.activo = false`, no puede subir ni
 *    borrar (baja de cliente sin tener que borrar su fila de
 *    perfiles_admin).
 *
 * 3. TIPO DE ARCHIVO REAL. Antes se confiaba en `file.type`, que lo
 *    manda el cliente (un SVG con script pasaba como "image/svg+xml").
 *    Ahora solo se aceptan JPEG, PNG y WebP, verificados por sus
 *    primeros bytes, y el Content-Type guardado en R2 lo decide el
 *    Worker, no el navegador.
 *
 * 4. NOMBRE DE ARCHIVO GENERADO AQUÍ. El campo `path` que manda el
 *    navegador se ignora por completo: el Worker arma la ruta con el
 *    slug del criador + un nombre aleatorio. El navegador solo usa la
 *    `url` que regresa el Worker, así que no hay que cambiar el frontend.
 *
 * 5. LÍMITES. 3 MB por imagen (el navegador ya comprime a ~1280px) y
 *    máximo 10 rutas por petición de borrado.
 *
 * 6. CORS por lista. ALLOWED_ORIGIN acepta "*" o una lista separada por
 *    comas de orígenes exactos (ver wrangler.toml).
 *
 * Lo que este Worker NO hace: limitar la frecuencia de peticiones. Para
 * eso, agrega una regla de Rate Limiting en el dashboard de Cloudflare.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_BYTES + 256 * 1024; // margen para el multipart
const MAX_RUTAS_BORRADO = 10;
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,60}$/;

export default {
    async fetch(request, env) {
        const cors = corsHeaders(request, env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        if (request.method !== 'POST' && request.method !== 'DELETE') {
            return jsonResponse({ error: 'Método no permitido.' }, 405, cors);
        }

        const token = extraerToken(request);
        if (!token) {
            return jsonResponse({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' }, 401, cors);
        }

        let usuario;
        let criador;
        try {
            usuario = await verificarSesion(token, env);
            if (!usuario) {
                return jsonResponse({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' }, 401, cors);
            }
            criador = await obtenerCriador(token, usuario.id, env);
        } catch {
            return jsonResponse({ error: 'No se pudo verificar tu cuenta. Intenta de nuevo en un momento.' }, 503, cors);
        }

        if (!criador) {
            return jsonResponse({ error: 'Tu cuenta no está asociada a un criador activo.' }, 403, cors);
        }

        if (request.method === 'POST') {
            return manejarSubida(request, env, usuario, criador, cors);
        }
        return manejarBorrado(request, env, criador, cors);
    }
};

// ---------------------------------------------------------------------
// Autenticación y autorización
// ---------------------------------------------------------------------

function extraerToken(request) {
    const header = request.headers.get('Authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

// Devuelve el usuario si el token es válido, null si Supabase lo
// rechaza, y lanza si Supabase no responde (para distinguir "sesión
// mala" de "Supabase caído").
async function verificarSesion(token, env) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.SUPABASE_ANON_KEY
        }
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`Supabase auth respondió ${res.status}`);

    const usuario = await res.json();
    return usuario && usuario.id ? usuario : null;
}

// Consulta con el token del usuario (no con una llave de servicio): RLS
// garantiza que solo vea su propio mapeo y su propio criador.
async function obtenerCriador(token, userId, env) {
    const url = `${env.SUPABASE_URL}/rest/v1/perfiles_admin`
        + `?select=criador_id,criadores(slug,activo)`
        + `&user_id=eq.${encodeURIComponent(userId)}&limit=1`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.SUPABASE_ANON_KEY,
            Accept: 'application/json'
        }
    });
    if (!res.ok) throw new Error(`Supabase REST respondió ${res.status}`);

    const filas = await res.json();
    const criador = Array.isArray(filas) && filas[0] ? filas[0].criadores : null;

    if (!criador || criador.activo !== true) return null;
    if (typeof criador.slug !== 'string' || !SLUG_VALIDO.test(criador.slug)) return null;

    return { id: filas[0].criador_id, slug: criador.slug };
}

function prefijoDe(criador) {
    return `${criador.slug}/ejemplares/`;
}

// ---------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------

// Identifica el formato REAL por sus primeros bytes. Devuelve null si
// no es JPEG, PNG ni WebP (SVG, HTML, HEIC, etc. se rechazan).
function detectarTipoImagen(b) {
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
        return { ext: 'jpg', contentType: 'image/jpeg' };
    }
    if (
        b.length >= 8 &&
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
        b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A
    ) {
        return { ext: 'png', contentType: 'image/png' };
    }
    if (
        b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50  // "WEBP"
    ) {
        return { ext: 'webp', contentType: 'image/webp' };
    }
    return null;
}

async function manejarSubida(request, env, usuario, criador, cors) {
    const declarado = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declarado) && declarado > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'La imagen es demasiado grande.' }, 413, cors);
    }

    let formData;
    try {
        formData = await request.formData();
    } catch {
        return jsonResponse({ error: 'Solicitud inválida: se esperaba form-data.' }, 400, cors);
    }

    const file = formData.get('file');
    // (el campo "path" que mande el navegador se ignora a propósito)

    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
        return jsonResponse({ error: 'Falta el archivo de imagen.' }, 400, cors);
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
        return jsonResponse({ error: 'La imagen es demasiado grande (máximo 3 MB).' }, 400, cors);
    }

    const cabecera = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const tipo = detectarTipoImagen(cabecera);
    if (!tipo) {
        return jsonResponse({ error: 'Solo se permiten imágenes JPG, PNG o WebP.' }, 400, cors);
    }

    const key = `${prefijoDe(criador)}${Date.now()}_${crypto.randomUUID()}.${tipo.ext}`;

    await env.BUCKET_EJEMPLARES.put(key, file.stream(), {
        httpMetadata: {
            contentType: tipo.contentType,
            cacheControl: 'public, max-age=31536000, immutable'
        },
        customMetadata: { subidoPor: usuario.id }
    });

    return jsonResponse({ url: `${env.R2_PUBLIC_BASE_URL}/${key}` }, 200, cors);
}

// ---------------------------------------------------------------------
// Borrado
// ---------------------------------------------------------------------

// Una ruta se puede borrar solo si cuelga directamente de la carpeta
// del criador que hace la petición (sin subcarpetas ni trucos).
function rutaBorrableDe(path, criador) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 300) return false;
    if (/[\\\u0000-\u001f]/.test(path) || path.includes('..')) return false;

    const prefijo = prefijoDe(criador);
    if (!path.startsWith(prefijo)) return false;

    const nombre = path.slice(prefijo.length);
    return nombre.length > 0 && !nombre.includes('/');
}

async function manejarBorrado(request, env, criador, cors) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Solicitud inválida: se esperaba JSON.' }, 400, cors);
    }

    const paths = Array.isArray(body && body.paths) ? body.paths.slice(0, MAX_RUTAS_BORRADO) : [];
    const pathsValidos = paths.filter(p => rutaBorrableDe(p, criador));

    if (pathsValidos.length === 0) {
        return jsonResponse({ error: 'No se recibieron rutas válidas para borrar.' }, 400, cors);
    }

    await Promise.all(pathsValidos.map(path => env.BUCKET_EJEMPLARES.delete(path)));

    return jsonResponse({ borrados: pathsValidos.length }, 200, cors);
}

// ---------------------------------------------------------------------
// Utilidades de respuesta
// ---------------------------------------------------------------------

function corsHeaders(request, env) {
    const permitidos = String(env.ALLOWED_ORIGIN || '*')
        .split(',')
        .map(o => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);

    const headers = {
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };

    if (permitidos.includes('*')) {
        headers['Access-Control-Allow-Origin'] = '*';
    } else {
        const origen = request.headers.get('Origin');
        if (origen && permitidos.includes(origen)) {
            headers['Access-Control-Allow-Origin'] = origen;
        }
    }
    return headers;
}

function jsonResponse(data, status, cors) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors }
    });
}
