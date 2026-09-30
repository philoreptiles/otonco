/**
 * src/utils/image-validation.js
 * ---------------------------------------------------------------------
 * Validación de imágenes por MAGIC BYTES, no por MIME.
 *
 * ¿Por qué? En iOS, `file.type` (el MIME que reporta el navegador)
 * es poco confiable: el picker nativo a veces lo deja vacío ('')
 * o como 'application/octet-stream', sobre todo cuando la foto
 * viene de la app Archivos, de iCloud Drive, o de un AirDrop
 * guardado como archivo. Los magic bytes (la firma binaria real
 * del formato, en los primeros bytes del archivo) NO se pueden
 * falsificar ni omitir: si el archivo es HEIC, los bytes lo dicen
 * aunque el MIME mienta.
 *
 * Sin esto, un HEIC con file.type vacío se colaba por todos los
 * chequeos basados en MIME y terminaba subido crudo a R2 (imagen
 * rota en el catálogo público) en vez de rechazado con un mensaje
 * accionable.
 *
 * Este módulo es la ÚNICA fuente de verdad para validar imágenes
 * antes de subirlas. Lo usan:
 *   - image-compressor.js (para abortar antes de intentar decodificar)
 *   - admin-view.js (en handleFilePreview, previewEditImage y uploadImage)
 */

// Brands ISO BMFF que corresponden a HEIC/HEIF/AVIF. Aparecen en el
// offset 8 de los archivos con firma "ftyp" en el offset 4.
// Referencia: ISO/IEC 23008-12 (HEIF) y las brands que Apple usa
// en la práctica.
const HEIC_BRANDS = new Set([
    'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
    'mif1', 'msf1', 'avif', 'avis' // AVIF comparte contenedor ISO BMFF
]);

/**
 * Detecta si un archivo es HEIC/HEIF/AVIF mirando sus magic bytes.
 * Funciona SIEMPRE, incluso cuando file.type viene vacío o mal.
 *
 * @param {File|Blob} file
 * @returns {Promise<boolean>}
 */
export async function esFormatoISO_BMFF_noSoportado(file) {
    // Atajo: si el MIME ya lo delata, no hace falta leer bytes.
    if (file.type && /^image\/(hei[cf]|avif)/i.test(file.type)) {
        return true;
    }

    try {
        // Solo necesitamos los primeros 12 bytes:
        //   offset 0-3: tamaño del box (no nos importa)
        //   offset 4-7: "ftyp" (FourCC del box)
        //   offset 8-11: brand principal (heic, mif1, avif, etc.)
        const buffer = await file.slice(0, 12).arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (bytes.length < 12) return false;

        const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
        if (ftyp !== 'ftyp') return false;

        const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
        return HEIC_BRANDS.has(brand);
    } catch {
        // Si no se puede leer el archivo, no lo rechazamos aquí:
        // que falle más adelante con un error más específico.
        return false;
    }
}

/**
 * Valida que un archivo sea una imagen utilizable en el catálogo.
 * Devuelve { ok: true } o { ok: false, mensaje: '...' }.
 *
 * Reemplaza la lógica duplicada que estaba en handleFilePreview y
 * previewEditImage -- así ambos formularios rechazan exactamente
 * lo mismo, con el mismo mensaje.
 *
 * @param {File} file
 * @param {number} maxRawFileSize - en bytes
 * @returns {Promise<{ok: boolean, mensaje?: string}>}
 */
export async function validarImagenParaSubir(file, maxRawFileSize) {
    if (!file) {
        return { ok: false, mensaje: 'No se seleccionó ningún archivo.' };
    }

    // Aceptamos image/* O archivos sin MIME (iOS a veces no lo pone)
    // que igual pasen la validación de magic bytes más abajo.
    const tieneMimeDeImagen = file.type && file.type.startsWith('image/');
    const mimeVacio = !file.type || file.type === 'application/octet-stream';

    if (!tieneMimeDeImagen && !mimeVacio) {
        return { ok: false, mensaje: 'Selecciona un archivo de imagen válido (JPG, PNG, WEBP).' };
    }

    if (file.size > maxRawFileSize) {
        return { ok: false, mensaje: 'La imagen pesa demasiado (máximo 15MB).' };
    }

    if (await esFormatoISO_BMFF_noSoportado(file)) {
        return {
            ok: false,
            mensaje:
                'Esta foto está en formato HEIC/HEIF (el formato nativo de cámara de iPhone) y no se puede usar así. ' +
                'Opciones: (1) Para fotos NUEVAS: Ajustes > Cámara > Formatos > "Más compatible". ' +
                '(2) Para una foto que YA tienes: en la app Fotos, tócala > Compartir > "Compartir como imagen" ' +
                '(eso la convierte a JPEG); o duplícala y elige "Duplicar como JPEG" (iOS 17+); ' +
                'o súbela desde una computadora convirtiéndola antes a JPEG.'
        };
    }

    return { ok: true };
}