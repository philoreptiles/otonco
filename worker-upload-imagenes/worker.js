/**
 * worker-upload-imagenes/worker.js
 * ---------------------------------------------------------------------
 * Pequeño backend (Cloudflare Worker) que autoriza subir/borrar
 * imágenes en el bucket de R2 compartido entre todos los criadores.
 *
 * POR QUÉ EXISTE: las credenciales para escribir en R2 no pueden vivir
 * en el código del navegador (a diferencia de la llave "anon" de
 * Supabase, que sí está diseñada para ser pública). Este Worker corre
 * en el servidor de Cloudflare, tiene acceso directo al bucket vía el
 * "binding" configurado en wrangler.toml (sin necesidad de llaves de
 * acceso tipo S3), y antes de aceptar cualquier subida o borrado
 * confirma con Supabase que quien pide la acción tiene una sesión de
 * administrador válida.
 *
 * Lo que NO hace: no distingue de qué criador es cada imagen para
 * efectos de seguridad -- solo confirma "¿esta persona es un
 * administrador de ALGÚN criador dado de alta en el sistema?". Eso es
 * suficiente porque las imágenes del catálogo son públicas de
 * cualquier forma (la protección real de los datos de cada criador
 * vive en las políticas RLS de Supabase, no aquí). El "path" que
 * manda el navegador (ej. "escama-y-colmillo/ejemplares/...") solo
 * organiza el bucket, no es una frontera de seguridad.
 */

export default {
    async fetch(request, env) {

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(env) });
        }

        // Toda solicitud (subir o borrar) debe traer una sesión de
        // Supabase válida en el header Authorization.
        const usuario = await verificarSesion(request, env);
        if (!usuario) {
            return jsonError('Sesión inválida o expirada. Vuelve a iniciar sesión.', 401, env);
        }

        if (request.method === 'POST') {
            return manejarSubida(request, env);
        }

        if (request.method === 'DELETE') {
            return manejarBorrado(request, env);
        }

        return jsonError('Método no permitido.', 405, env);
    }
};

async function verificarSesion(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;

    try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: env.SUPABASE_ANON_KEY
            }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Evita que alguien mande un "path" que se salga de la carpeta del
// bucket (ej. "../../otra-cosa") o una ruta absoluta.
function pathEsValido(path) {
    return typeof path === 'string'
        && path.length > 0
        && path.length < 300
        && !path.includes('..')
        && !path.startsWith('/');
}

async function manejarSubida(request, env) {
    let formData;
    try {
        formData = await request.formData();
    } catch {
        return jsonError('Solicitud inválida: se esperaba form-data.', 400, env);
    }

    const file = formData.get('file');
    const path = formData.get('path');

    if (!file || !pathEsValido(path)) {
        return jsonError('Faltan datos del archivo o la ruta no es válida.', 400, env);
    }

    if (!file.type || !file.type.startsWith('image/')) {
        return jsonError('Solo se permiten imágenes.', 400, env);
    }

    // 10MB de margen del lado del servidor (el navegador ya comprime
    // antes de llegar aquí, esto es solo un límite de seguridad).
    if (file.size > 10 * 1024 * 1024) {
        return jsonError('La imagen es demasiado grande.', 400, env);
    }

    await env.BUCKET_EJEMPLARES.put(path, file.stream(), {
        httpMetadata: { contentType: file.type }
    });

    const url = `${env.R2_PUBLIC_BASE_URL}/${path}`;

    return new Response(JSON.stringify({ url }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
    });
}

async function manejarBorrado(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonError('Solicitud inválida: se esperaba JSON.', 400, env);
    }

    const paths = Array.isArray(body.paths) ? body.paths : [];
    const pathsValidos = paths.filter(pathEsValido);

    if (pathsValidos.length === 0) {
        return jsonError('No se recibieron rutas válidas para borrar.', 400, env);
    }

    await Promise.all(pathsValidos.map(path => env.BUCKET_EJEMPLARES.delete(path)));

    return new Response(JSON.stringify({ borrados: pathsValidos.length }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
    });
}

function corsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    };
}

function jsonError(message, status, env) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
    });
}
