import { initSupabase } from './supabase-config.js';
import { renderHeader } from './components/common/header/header.js';
import { renderHero } from './components/common/hero/hero.js';
import { renderFooter } from './components/common/footer/footer.js';
import { renderFeatured } from './components/ui/featured/featured.js';
import { renderFilters } from './components/ui/filters/filters.js';
import { renderCatalog, abrirEjemplarDesdeQuery } from './components/ui/catalog/catalog.js';

export async function initApp() {
    initSupabase();

    renderHeader('header-root');
    renderHero('hero-root');
    renderFooter('footer-root');

    renderFeatured('featured-root');

    await renderFilters('filters-root', (filters) => {
        renderCatalog('catalog-root', filters);
    });

    await renderCatalog('catalog-root');

    // Si alguien llegó desde un link "Compartir" (?ejemplar=ID), se
    // abre el modal directo -- después de renderCatalog() para poder
    // aprovechar lo que ya haya quedado cargado en catalogData.
    await abrirEjemplarDesdeQuery();
}