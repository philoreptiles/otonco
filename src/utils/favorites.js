/**
 * src/utils/favorites.js
 * ---------------------------------------------------------------------
 * Favoritos del visitante público, guardados en localStorage -- no
 * requiere cuenta ni backend. Vive por navegador/dispositivo, igual
 * que las "vistas guardadas" del admin (mismo criterio: preferencia
 * local, no dato del negocio, así que no tiene sentido guardarlo en
 * Supabase).
 *
 * Se guarda solo el arreglo de IDs de ejemplar, no el registro
 * completo -- si el criador cambia precio/estatus/fotos después, el
 * modal siempre muestra la versión actual al reabrir, nunca una copia
 * vieja atrapada en localStorage.
 */

const STORAGE_KEY = 'eyc_favoritos';

function leerFavoritos() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(data) ? data : [];
    } catch {
        // localStorage corrupto, deshabilitado por el navegador (modo
        // privado en algunos casos), o el usuario lo manipuló a mano --
        // en cualquier caso, se degrada a "sin favoritos" en vez de
        // romper el modal.
        return [];
    }
}

function guardarFavoritos(favoritos) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favoritos));
    } catch {
        // Igual que arriba: si no se puede escribir (cuota llena,
        // localStorage bloqueado), simplemente no persiste -- no debe
        // tumbar la interacción del visitante.
    }
}

export function getFavoritos() {
    return leerFavoritos();
}

export function esFavorito(id) {
    return leerFavoritos().includes(id);
}

/**
 * Agrega o quita el id de favoritos. Devuelve el nuevo estado
 * (true = quedó marcado como favorito) para que quien llama pueda
 * actualizar el ícono sin tener que volver a preguntar.
 */
export function toggleFavorito(id) {
    const favoritos = leerFavoritos();
    const index = favoritos.indexOf(id);

    if (index >= 0) {
        favoritos.splice(index, 1);
        guardarFavoritos(favoritos);
        return false;
    }

    favoritos.push(id);
    guardarFavoritos(favoritos);
    return true;
}
