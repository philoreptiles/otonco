/**
 * src/utils/security.js
 * ---------------------------------------------------------------------
 * Utilidades de saneamiento para evitar XSS (cross-site scripting).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO:
 * Varias vistas (catálogo público, modal de detalle, tabla del admin)
 * insertan datos que vienen directo de la base de datos usando
 * `innerHTML`. Si esos datos no se escapan antes de insertarse, y
 * alguien logra escribir en la tabla `ejemplares` (por un fallo de
 * RLS, una cuenta comprometida, o un futuro formulario público),
 * podría inyectar HTML/JS que se ejecuta en el navegador de CADA
 * visitante del catálogo — un "stored XSS" clásico.
 *
 * Antes de este archivo, `card.js` y `modal.js` interpolaban
 * `especie`, `genetica`, `sexo`, `estatus`, `imagen_url`, etc.
 * directamente en `innerHTML` sin escapar. `admin-view.js` ya hacía
 * un escapado propio (función local `escapeHTML`); aquí se centraliza
 * para que TODAS las vistas usen exactamente la misma lógica.
 *
 * CÓMO USARLO:
 * - `escapeHTML(valor)`: usar en cualquier texto que vaya dentro de
 *   una plantilla `innerHTML`, ya sea como contenido de una etiqueta
 *   o como valor de un atributo (ej. `alt="${escapeHTML(especie)}"`).
 * - `safeImageUrl(url)`: usar específicamente para valores que van en
 *   `src="${...}"` de una imagen. Además de escapar comillas, verifica
 *   que la URL sea http(s) (o relativa) antes de aceptarla, para
 *   evitar esquemas como `javascript:` en un campo mal validado.
 */

import { siteConfig } from '../site-config.js';

export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Placeholder para ejemplares sin foto.
 *
 * ANTES: apuntaba a "https://via.placeholder.com/400x300?text=Sin+Imagen",
 * un servicio externo que además ya no existe (dejó de operar) -- por
 * eso cualquier ejemplar sin foto mostraba el ícono de "imagen rota"
 * del navegador en vez de un placeholder de verdad.
 *
 * AHORA: es un ícono de cámara dibujado como SVG inline (data URI). No
 * hace ninguna petición de red, y toma sus colores de siteConfig
 * (colors.background / colors.secondary) para que cada criador vea el
 * placeholder en los colores de SU sitio sin tener que tocar este
 * archivo. Es el MISMO ícono que el fondo de carga en
 * src/components/common/card/card.css -- si se ajustan las
 * proporciones aquí, actualizar también ese CSS.
 */
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="${siteConfig.colors.background}"/>
    <rect x="120" y="105" width="160" height="110" rx="14" fill="none" stroke="${siteConfig.colors.secondary}" stroke-width="7"/>
    <rect x="172" y="82" width="56" height="26" rx="6" fill="none" stroke="${siteConfig.colors.secondary}" stroke-width="7"/>
    <circle cx="200" cy="160" r="34" fill="none" stroke="${siteConfig.colors.secondary}" stroke-width="7"/>
</svg>
`.trim();

const PLACEHOLDER_IMG = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/**
 * Devuelve una URL de imagen segura para usar en `src="${...}"`.
 * Si la URL no es http/https (por ejemplo un esquema `javascript:`
 * inyectado en un campo mal saneado en otro punto del sistema),
 * regresa el placeholder en vez de la URL sospechosa.
 */
export function safeImageUrl(url, fallback = PLACEHOLDER_IMG) {
    if (!url) return fallback;

    try {
        // Permite URLs relativas (mismo origen) y absolutas http(s).
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return escapeHTML(url);
        }
    } catch {
        // URL inválida -> cae al fallback
    }

    return fallback;
}
