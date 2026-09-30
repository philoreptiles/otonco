/**
 * src/utils/icons.js
 * ---------------------------------------------------------------------
 * Set mínimo de íconos SVG en línea (estilo trazo, 24x24), sin depender
 * de ninguna librería externa ni de un paso de build adicional -- son
 * strings que se insertan tal cual en innerHTML, igual que el SVG de
 * WhatsApp que ya vive en modal.js.
 *
 * Todos heredan color de `currentColor`, así que basta con controlar
 * `color` en el CSS del elemento que los envuelve (ya sea una variable
 * de siteConfig como --primary-color/--moonstone-color, o un color fijo)
 * para que combinen con la paleta de cualquier criador sin tocar este
 * archivo.
 *
 * Uso:
 *   import { iconMarkup } from '../../../utils/icons.js';
 *   el.innerHTML = `${iconMarkup('checkCircle', 'status-icon')} Disponible`;
 */

function svg(paths) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const icons = {
    arrowUp: svg('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>'),

    alertTriangle: svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),

    refreshCw: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),

    // Íconos de estatus del ejemplar (Disponible / Apartado / Vendido / Holdback)
    checkCircle: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    xCircle: svg('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
    lock: svg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),

    // Estado vacío del catálogo (sin resultados para los filtros actuales)
    searchX: svg('<circle cx="11" cy="11" r="8"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),

    // Modal: favoritos (localStorage) y compartir
    heart: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>'),
    share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'),

    // Dashboard: íconos de las tarjetas KPI
    trendingUp: svg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
    dollarSign: svg('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    package: svg('<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    tag: svg('<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    sparkles: svg('<path d="m12 3 1.9 4.9L19 9.8l-4.9 1.9L12 17l-1.9-5.1L5 9.8l5.1-1.9Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>'),
};

/**
 * Devuelve el markup de un ícono, opcionalmente con una clase CSS extra
 * (para controlar tamaño/color/margen desde el componente que lo usa).
 * Si el nombre no existe, devuelve cadena vacía en vez de romper el
 * render -- un ícono faltante no debería tirar toda una página.
 */
export function iconMarkup(name, className = '') {
    const markup = icons[name];
    if (!markup) return '';
    return className ? markup.replace('<svg ', `<svg class="${className}" `) : markup;
}
