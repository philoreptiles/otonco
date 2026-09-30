/**
 * src/utils/image-compressor.js
 * ---------------------------------------------------------------------
 * Compresión de imágenes en el navegador antes de subirlas a R2.
 *
 * CAMBIO (detección de formato): antes esta función chequeaba
 * `file.type` con un regex para detectar HEIC/HEIF. En iOS ese MIME
 * a veces viene vacío, así que el regex no matcheaba y el archivo
 * seguía de largo hasta que `img.onerror` fallaba más tarde -- y
 * entonces el caller (uploadImage en admin-view.js) caía al fallback
 * de subir el archivo crudo, dejando una imagen rota en R2. Ahora la
 * detección se hace por MAGIC BYTES (ver image-validation.js), que
 * es confiable incluso cuando el MIME miente, y el error lleva un
 * `code` que permite al caller distinguirlo de un fallo genérico de
 * compresión.
 */

import { esFormatoISO_BMFF_noSoportado } from './image-validation.js';

export async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    // Formatos que ningún <img> de navegador puede decodificar de forma
    // confiable (ni siquiera Safari en su propio dispositivo, fuera de
    // apps nativas de Apple). Se detectan por magic bytes, no por MIME,
    // porque en iOS el MIME a veces viene vacío. El error lleva un code
    // propio ('FORMATO_NO_DECODIFICABLE') para que uploadImage() sepa
    // que NO debe intentar subir el original crudo como fallback.
    if (await esFormatoISO_BMFF_noSoportado(file)) {
        throw Object.assign(
            new Error('Formato HEIC/HEIF/AVIF no soportado para comprimir en el navegador.'),
            { code: 'FORMATO_NO_DECODIFICABLE' }
        );
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG en vez de WebP. WebP pesaba menos, pero Safari
                // (Mac y sobre todo iOS) no soporta de forma confiable
                // CODIFICAR WebP desde canvas.toBlob() -- soporta
                // mostrarlo (decodificar) desde Safari 14, que es una
                // cosa muy distinta. En los dispositivos donde toBlob()
                // no reconoce 'image/webp', el callback recibe blob=null
                // -- eso hacía fallar la subida completa desde
                // iPhones/iPads: no había ningún blob que subir. JPEG sí
                // es 100% soportado por toBlob() en todos los navegadores
                // y dispositivos relevantes desde hace años.
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Error al comprimir la imagen'));
                    }
                }, 'image/jpeg', quality);
            };

            img.onerror = () => reject(new Error('Error al cargar la imagen'));
        };

        reader.onerror = () => reject(new Error('Error al leer el archivo'));
    });
}

export function createImagePreview(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => resolve(e.target.result);
    });
}