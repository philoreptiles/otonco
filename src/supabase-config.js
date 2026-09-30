import { createClient } from '@supabase/supabase-js';
import { siteConfig } from './site-config.js';

// CAMBIO IMPORTANTE PARA USAR ESTE PROYECTO COMO PLANTILLA:
// Antes, si un criador clonaba el repo y olvidaba configurar sus propias
// variables de entorno, el sitio caía silenciosamente en las credenciales
// de TU proyecto de Supabase (hardcodeadas aquí como "respaldo"). Eso
// significa que su catálogo público habría escrito ejemplares, imágenes
// y consultas directamente en tu base de datos sin que nadie lo notara.
// Ahora, si faltan las variables de entorno, el sitio falla de inmediato
// y con un mensaje claro en vez de mezclar datos entre clientes.
//
// MULTI-TENENCIA: varios criadores pueden compartir el MISMO proyecto de
// Supabase (ver sql/multi_tenant_criadores.sql) -- ahí sí es intencional
// y seguro, porque cada fila queda ligada a un criador_id y RLS impide
// que un criador autenticado vea o toque los datos de otro. Lo que este
// mensaje evita es la mezcla ACCIDENTAL por un .env mal configurado.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
        'Configúralas en tu archivo .env (desarrollo local) o en las variables de entorno ' +
        'de Cloudflare Pages (producción) antes de desplegar. Cada criador debe usar SU ' +
        'PROPIO proyecto de Supabase, nunca el de otro cliente.'
    );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function initSupabase() {
    return supabase;
}

export async function getEspecies() {
    const { data, error } = await supabase
        .from('especies')
        .select('*')
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error al obtener especies:', error);
        return [];
    }
    return data || [];
}

export async function crearEspecie(nombre, criadorId) {
    const { data, error } = await supabase
        .from('especies')
        .insert([{ nombre, criador_id: criadorId }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Consulta a qué criador pertenece el usuario admin actualmente
// autenticado (ver public.perfiles_admin en
// sql/multi_tenant_criadores.sql). Se usa para completar criador_id
// al insertar ejemplares/especies desde el panel -- sin esto, RLS
// rechaza el insert porque no puede confirmar de quién es la fila.
export async function getMiCriadorId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('perfiles_admin')
        .select('criador_id')
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('No se pudo determinar el criador del usuario actual:', error);
        return null;
    }
    return data?.criador_id ?? null;
}

// CAMBIO: el catalogo publico ahora respeta "visible_publico". Antes esta
// funcion (usada UNICAMENTE por el catalogo publico en catalog.js) traia
// TODOS los ejemplares sin excepcion -- incluidos los que el criador marca
// como Holdback o cualquiera que prefiera no mostrar todavia. Con este
// filtro, un ejemplar solo aparece en el sitio publico si el criador lo
// dejo marcado como visible desde Control. Las paginas de Control y
// Dashboard consultan la tabla directamente (no usan esta funcion), asi
// que ahi el criador sigue viendo el 100% del inventario sin excepcion.
//
// CAMBIO (paginación): antes esta función traía el 100% de los
// ejemplares visibles de un solo golpe, y catalog.js metía todas las
// tarjetas al DOM de una vez. Ahora acepta "page" (1-indexed) y
// "limit" (8 por default) dentro del mismo objeto de filtros, y usa
// .range(from, to) de Supabase para que la API solo devuelva ese
// bloque. catalog.js decide si hay más páginas viendo si el arreglo
// devuelto llegó completo (longitud === limit) -- si vino más corto,
// es la última página.
// CAMBIO (multi-tenencia): si este proyecto de Supabase es compartido
// entre varios criadores, esta consulta debe traer SOLO los ejemplares
// de ESTE sitio -- por eso el filtro .eq('criador_id', ...). No es una
// medida de seguridad (las filas que trae ya son públicas por
// visible_publico = true de cualquier forma), es para no mezclar el
// catálogo de un cliente con el de otro que comparte el mismo proyecto.
export async function getEjemplares(filters = {}) {
    const page = Number.isInteger(filters.page) && filters.page > 0 ? filters.page : 1;
    const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : 8;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('ejemplares')
        .select('*')
        .eq('visible_publico', true)
        .eq('criador_id', siteConfig.criadorId)
        .order('created_at', { ascending: false });

    if (filters.genetica && filters.genetica.trim() !== '') {
        query = query.ilike('genetica', `%${filters.genetica.trim()}%`);
    }
    if (filters.estatus && filters.estatus !== 'todos') {
        query = query.eq('estatus', filters.estatus);
    }
    if (filters.sexo && filters.sexo !== 'todos') {
        query = query.eq('sexo', filters.sexo);
    }
    if (filters.anio && filters.anio !== 'todos') {
        const yearNum = parseInt(filters.anio, 10);
        if (!isNaN(yearNum)) {
            query = query.or(`nacimiento.eq.${yearNum},nacimiento.eq.${filters.anio}`);
        }
    }
    if (filters.precioRango && filters.precioRango !== 'todos') {
        switch (filters.precioRango) {
            case '2000-3999':
                query = query.gte('precio', 2000).lte('precio', 3999);
                break;
            case '4000-8000':
                query = query.gte('precio', 4000).lte('precio', 8000);
                break;
            case '8000-14999':
                query = query.gte('precio', 8000).lte('precio', 14999);
                break;
            case '15000+':
                query = query.gte('precio', 15000);
                break;
        }
    }

    const { data, error } = await query.range(from, to);
    if (error) {
        console.error('Error al obtener ejemplares:', error);
        throw error;
    }
    return data;
}

// Usada por el link "Compartir" del modal (?ejemplar=ID en la URL) --
// mismas reglas de visibilidad que getEjemplares (visible_publico +
// criador_id de este sitio), así que un link compartido nunca expone
// un ejemplar en Holdback ni el de otro criador que comparta el mismo
// proyecto de Supabase. maybeSingle() en vez de single(): si el ID no
// existe o ya no es público, devuelve null en vez de lanzar un error.
export async function getEjemplarPorId(id) {
    const { data, error } = await supabase
        .from('ejemplares')
        .select('*')
        .eq('visible_publico', true)
        .eq('criador_id', siteConfig.criadorId)
        .eq('id', id)
        .maybeSingle();

    if (error) {
        console.error('Error al obtener ejemplar por id:', error);
        return null;
    }
    return data;
}

export async function getAniosDisponibles(filters = {}) {
    try {
        let query = supabase
            .from('ejemplares')
            .select('nacimiento')
            .eq('criador_id', siteConfig.criadorId)
            .not('nacimiento', 'is', null);

        if (filters.genetica && filters.genetica.trim() !== '') {
            query = query.ilike('genetica', `%${filters.genetica.trim()}%`);
        }
        if (filters.estatus && filters.estatus !== 'todos') {
            query = query.eq('estatus', filters.estatus);
        }
        if (filters.sexo && filters.sexo !== 'todos') {
            query = query.eq('sexo', filters.sexo);
        }
        if (filters.precioRango && filters.precioRango !== 'todos') {
            switch (filters.precioRango) {
                case '2000-3999':
                    query = query.gte('precio', 2000).lte('precio', 3999);
                    break;
                case '4000-8000':
                    query = query.gte('precio', 4000).lte('precio', 8000);
                    break;
                case '8000-14999':
                    query = query.gte('precio', 8000).lte('precio', 14999);
                    break;
                case '15000+':
                    query = query.gte('precio', 15000);
                    break;
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        const yearsSet = new Set();

        (data || []).forEach(item => {
            if (!item.nacimiento) return;

            let year = null;
            const val = item.nacimiento;

            if (typeof val === 'number' && val > 1900 && val < 2100) {
                year = val;
            } else if (typeof val === 'string') {
                const cleanVal = val.trim();
                if (/^\d{4}$/.test(cleanVal)) {
                    year = parseInt(cleanVal, 10);
                } else {
                    const parsedDate = new Date(cleanVal);
                    if (!isNaN(parsedDate.getTime())) {
                        year = parsedDate.getUTCFullYear();
                    }
                }
            }

            if (year && !isNaN(year) && year > 1970) {
                yearsSet.add(year);
            }
        });

        return Array.from(yearsSet).sort((a, b) => b - a);
    } catch (error) {
        console.error('Error al obtener años disponibles:', error);
        return [];
    }
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
}