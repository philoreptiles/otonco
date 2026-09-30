import { createCardElement } from '../../common/card/card.js';
import { getEjemplares, getEjemplarPorId } from '../../../supabase-config.js';
import { openModal } from '../modal/modal.js';
import { iconMarkup } from '../../../utils/icons.js';
import { startProgress, finishProgress } from '../../../utils/progress-bar.js';

const PAGE_SIZE = 8;

// catalogData ACUMULA todos los ejemplares cargados hasta ahora (todas
// las páginas ya traídas), porque el modal navega "siguiente/anterior"
// contra este arreglo por índice -- no solo contra la última página.
let catalogData = [];

let currentFilters = {};
let currentPage = 1;
let hasMorePages = true;
let isLoadingMore = false;

let containerElement = null;
let gridElement = null;

// Observer único, reutilizado en toda la vida de la página (carga
// inicial + cada "Cargar más") -- mismo patrón que initScrollReveal()
// en nosotros.js. Cada card se deja de observar en cuanto se revela
// una vez (obs.unobserve): es una entrada de una sola vez, no algo
// que deba repetirse si el visitante sube y baja por el catálogo.
const cardRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            cardRevealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

export async function renderCatalog(containerId, filters = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Toda llamada a renderCatalog() desde afuera (carga inicial o un
    // cambio de filtros) es un catálogo nuevo: se reinicia la
    // paginación desde cero, no se acumula sobre la búsqueda anterior.
    containerElement = container;
    currentFilters = filters;
    currentPage = 1;
    hasMorePages = true;
    isLoadingMore = false;
    catalogData = [];

    container.innerHTML = renderSkeletonGrid();
    startProgress();

    try {
        const primeraPagina = await getEjemplares({
            ...currentFilters,
            page: currentPage,
            limit: PAGE_SIZE
        }) || [];

        if (primeraPagina.length === 0) {
            container.innerHTML = `
                <div class="empty-catalog">
                    <span class="empty-icon">${iconMarkup('searchX')}</span>
                    <h3>Estos ejemplares se movieron de terrario</h3>
                    <p>Prueba con otras características</p>
                    <button type="button" class="btn-clear-filters" id="btn-empty-clear">
                        Limpiar filtros
                    </button>
                </div>
            `;

            const clearBtn = container.querySelector('#btn-empty-clear');
            clearBtn?.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('clearFiltersTrigger'));
            });
            return;
        }

        catalogData = primeraPagina;
        hasMorePages = primeraPagina.length === PAGE_SIZE;

        container.innerHTML = '';

        gridElement = document.createElement('div');
        gridElement.className = 'catalog-grid';
        gridElement.addEventListener('click', handleGridClick);
        container.appendChild(gridElement);

        appendCards(primeraPagina, 0);
        renderLoadMoreButton();

    } catch (error) {
        console.error('Error al renderizar catálogo:', error);
        container.innerHTML = `
            <div class="catalog-error">
                <span class="error-icon">${iconMarkup('alertTriangle')}</span>
                <p>Se nos enredó la conexión. Intenta de nuevo en un momento.</p>
                <button type="button" class="btn-clear-filters" id="btn-catalog-retry">
                    ${iconMarkup('refreshCw', 'btn-icon')}
                    Reintentar
                </button>
            </div>
        `;

        const retryBtn = container.querySelector('#btn-catalog-retry');
        retryBtn?.addEventListener('click', () => renderCatalog(containerId, currentFilters));
    } finally {
        finishProgress();
    }
}

/**
 * Grid de tarjetas "fantasma" con efecto shimmer, mostrado mientras
 * carga la primera página. Reemplaza el texto plano "Cargando
 * ejemplares..." por algo que ya insinúa la forma del contenido real
 * -- es la mejora de percepción de velocidad más barata que hay.
 */
function renderSkeletonGrid(count = PAGE_SIZE) {
    const skeletons = Array.from({ length: count }, () => `
        <div class="card-skeleton">
            <div class="card-skeleton-image"></div>
            <div class="card-skeleton-line card-skeleton-line--wide"></div>
            <div class="card-skeleton-line"></div>
            <div class="card-skeleton-line card-skeleton-line--short"></div>
        </div>
    `).join('');

    return `<div class="catalog-grid catalog-grid--skeleton">${skeletons}</div>`;
}

function appendCards(ejemplares, startIndex) {
    ejemplares.forEach((ejemplar, i) => {
        const card = createCardElement(ejemplar);
        card.dataset.index = startIndex + i;
        // Entrada en cascada: cada card de este lote se retrasa un
        // poco más que la anterior CUANDO SE VUELVE VISIBLE (no al
        // insertarse). Se limita el índice usado para el cálculo (no
        // el índice real) para que "Cargar más" con muchos resultados
        // no deje la última card esperando segundos enteros.
        card.classList.add('reveal-on-scroll');
        card.style.transitionDelay = `${Math.min(i, 11) * 0.05}s`;
        gridElement.appendChild(card);
        cardRevealObserver.observe(card);
    });
}

function handleGridClick(event) {
    const card = event.target.closest('.card');
    if (!card) return;

    const index = parseInt(card.dataset.index, 10);
    if (!isNaN(index) && catalogData[index]) {
        // NOTA: el modal navega "siguiente/anterior" sobre catalogData,
        // que solo tiene lo ya cargado. Si el criador tiene, por ejemplo,
        // 20 ejemplares visibles y el visitante todavía no le da
        // "Cargar más", el modal solo podrá recorrer los primeros 8 --
        // no salta a páginas que el navegador nunca pidió. En cuanto se
        // hace clic en "Cargar más" una vez, esos ejemplares ya quedan
        // disponibles para navegar dentro del modal también.
        openModal(catalogData[index], catalogData, index);
    }
}

function renderLoadMoreButton() {
    if (!hasMorePages || !containerElement) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-load-more-wrapper';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-clear-filters btn-load-more';
    button.textContent = 'Cargar más';
    button.addEventListener('click', handleLoadMoreClick);

    wrapper.appendChild(button);
    containerElement.appendChild(wrapper);
}

/**
 * Abre el modal directo si la URL trae ?ejemplar=ID (generado por el
 * botón "Compartir" del modal). Se llama una sola vez desde app.js,
 * después de que renderCatalog() ya resolvió la primera página.
 *
 * Primero busca en catalogData (lo que ya está cargado) para que, si
 * el ejemplar cae en la primera página, el modal abra pudiendo
 * navegar "siguiente/anterior" igual que si se le hubiera dado clic a
 * la card. Si no está ahí (cayó en una página posterior, o ya no
 * pasa los filtros por default), se trae solo con getEjemplarPorId()
 * y se abre sin lista para navegar -- openModal() ya soporta ese caso
 * (ver modal.js: currentList cae a [ejemplar] cuando no se le pasa un
 * arreglo).
 */
export async function abrirEjemplarDesdeQuery() {
    const idParam = new URLSearchParams(window.location.search).get('ejemplar');
    if (!idParam) return;

    const indexEnCatalogo = catalogData.findIndex(e => String(e.id) === idParam);
    if (indexEnCatalogo >= 0) {
        openModal(catalogData[indexEnCatalogo], catalogData, indexEnCatalogo);
        return;
    }

    try {
        const ejemplar = await getEjemplarPorId(idParam);
        if (ejemplar) {
            openModal(ejemplar);
        }
    } catch (error) {
        console.error('Error al abrir el ejemplar desde el link compartido:', error);
    }
}

async function handleLoadMoreClick(event) {
    if (isLoadingMore) return;

    const button = event.currentTarget;
    const wrapper = button.parentElement;
    const pageToFetch = currentPage + 1;

    isLoadingMore = true;
    button.disabled = true;
    button.textContent = 'Cargando...';
    startProgress();

    try {
        const siguientePagina = await getEjemplares({
            ...currentFilters,
            page: pageToFetch,
            limit: PAGE_SIZE
        }) || [];

        currentPage = pageToFetch;
        hasMorePages = siguientePagina.length === PAGE_SIZE;

        if (siguientePagina.length > 0) {
            const startIndex = catalogData.length;
            catalogData = catalogData.concat(siguientePagina);
            appendCards(siguientePagina, startIndex);
        }

        if (hasMorePages) {
            isLoadingMore = false;
            button.disabled = false;
            button.textContent = 'Cargar más';
        } else {
            // Ya no hay más resultados: se quita el botón por completo
            // en vez de dejarlo deshabilitado con texto raro.
            wrapper.remove();
        }

    } catch (error) {
        console.error('Error al cargar más ejemplares:', error);
        isLoadingMore = false;
        button.disabled = false;
        button.textContent = 'Reintentar';
    } finally {
        finishProgress();
    }
}
