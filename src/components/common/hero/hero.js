/**
 * src/components/common/hero/hero.js
 * ---------------------------------------------------------------------
 * Banda corta arriba de los filtros del catálogo público, con el
 * nombre de marca en grande y una tagline opcional (siteConfig.tagline).
 * Antes el catálogo iba directo del header a los filtros -- sin ningún
 * momento de "esto es [marca]" antes de ver ejemplares.
 *
 * Si tagline está vacío ('' en site-config.js), se muestra solo el
 * nombre -- no se generan taglines genéricos a la fuerza, porque un
 * texto de relleno ("¡Los mejores reptiles!") suena más vacío que no
 * tener nada.
 */
import { siteConfig } from '../../../site-config.js';

export function renderHero(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const taglineHTML = siteConfig.tagline
        ? `<p class="hero-tagline">${siteConfig.tagline}</p>`
        : '';

    container.innerHTML = `
        <section class="site-hero">
            <div class="hero-container">
                <h1 class="hero-brand">Nuestros ejemplares</h1>
            </div>
        </section>
    `;
}
