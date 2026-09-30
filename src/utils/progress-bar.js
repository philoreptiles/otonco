/**
 * src/utils/progress-bar.js
 * ---------------------------------------------------------------------
 * Barra de progreso fija arriba de la página (mismo patrón que
 * YouTube/GitHub) para las esperas de red que no tienen su propio
 * indicador visible completo: cambiar de filtro, cargar la página
 * inicial del catálogo, pedir "Cargar más".
 *
 * No es una barra de progreso real (no conocemos cuánto falta de la
 * consulta a Supabase) -- salta a 70% de inmediato y se queda ahí
 * "esperando", y al terminar completa a 100% y se desvanece. Es el
 * mismo truco que usan casi todas las barras de este tipo.
 */

let barEl = null;
let hideTimeoutId = null;

function ensureBar() {
    if (barEl) return barEl;
    barEl = document.createElement('div');
    barEl.className = 'top-progress-bar';
    document.body.appendChild(barEl);
    return barEl;
}

export function startProgress() {
    clearTimeout(hideTimeoutId);
    const bar = ensureBar();

    // Se reinicia en 0% sin transición (por si ya había una carga
    // previa a medias) y, un frame después, salta a 70% -- el mismo
    // truco de "pintar en el valor inicial, animar en el siguiente
    // frame" que ya se usa en el dashboard para que la transición
    // realmente se dispare.
    bar.classList.remove('is-loading');
    bar.style.width = '0%';

    requestAnimationFrame(() => {
        bar.classList.add('is-loading');
        bar.style.width = '70%';
    });
}

export function finishProgress() {
    if (!barEl) return;

    barEl.style.width = '100%';
    hideTimeoutId = setTimeout(() => {
        barEl.classList.remove('is-loading');
        barEl.style.width = '0%';
    }, 300);
}
