import { getAniosDisponibles } from '/src/supabase-config.js';
import { iconMarkup } from '../../../utils/icons.js';

/**
 * src/components/ui/filters/filters.js
 * ---------------------------------------------------------------------
 * CAMBIO (rediseño tipo "pills"): el panel de selects en cuadrícula se
 * sustituye por un buscador (arriba, aparte) + una barra horizontal
 * con scroll y sticky, con un "chip" por filtro y un chip "Aplicar".
 *
 * - NADA se aplica solo: el catálogo solo se actualiza al pulsar
 *   "Aplicar" (o Enter dentro del buscador) o al limpiar.
 * - El contrato con el resto del sitio NO cambia: se sigue llamando a
 *   onApplyCallback({ genetica, estatus, sexo, anio, ... }) con los
 *   mismos valores de siempre ('todos' como valor por defecto, y
 *   'Disponible' / 'Macho' / '2025' como valores reales). Lo único
 *   nuevo es `orden` ('precio-desc' | 'precio-asc' | ''), que reemplaza
 *   al viejo filtro por rango de precio (precioRango).
 * - Las opciones de Año siguen siendo dinámicas (getAniosDisponibles).
 *
 * CAMBIO ("Aplicar" siempre visible): el chip "Aplicar" ya no va al final
 * de la pista con scroll; está a su lado, fuera de ella, y no se mueve.
 * Mientras queden chips ocultos a la derecha de la pista, la barra lleva
 * la clase .has-more, que filters.css usa para dibujar un degradado.
 * Los ids y el contrato con onApplyCallback no cambian.
 *
 * CAMBIO (posición de "Limpiar todo"): vuelve a ser el primer chip de
 * la pista, a la izquierda (solo aparece si hay filtros activos), antes
 * de Disponibilidad, Sexo, Año y Ordenar; "Aplicar" sigue fijo a la
 * derecha, fuera de la pista. Solo cambia el orden del markup; la
 * lógica (ids, eventos, onApplyCallback) es la misma.
 *
 * CAMBIO (scroll al aplicar): al aplicar (clic en "Aplicar", Enter en el
 * buscador o limpiar), la pista vuelve a scrollLeft = 0 para mostrar
 * "Limpiar todo". El filtrado no cambia.
 *
 * NOTA (ordenamiento por precio): este archivo solo LEE el valor del
 * chip "Ordenar" y lo entrega en `orden` ('precio-asc' | 'precio-desc'
 * | '') a onApplyCallback; no ordena las fichas. El orden se aplica en
 * getEjemplares() de supabase-config.js (consulta paginada a Supabase).
 */

// Función auxiliar para evitar peticiones masivas a Supabase mientras se escribe
function debounce(fn, delay = 300) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

const prefiereMenosMovimiento = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Flecha del chip (decorativa: el <select> es el que recibe el foco y el clic).
const CHEVRON = `
    <svg class="filter-chip__chevron" viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
`;

export async function renderFilters(containerId, onApplyCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="filters-search">
            <input
                type="text"
                id="filtro-genetica"
                placeholder="Buscar genética..."
                aria-label="Buscar por genética"
                autocomplete="off"
                enterkeyhint="search"
            />
        </div>

        <div class="filters-bar" role="region" aria-label="Filtros del catálogo">
            <div class="filters-track">

                <!-- CAMBIO (posición): "Limpiar todo" es el PRIMER chip de la pista,
                     a la izquierda, y solo se muestra si hay algún filtro con
                     valor. Al estar al inicio del scroll nunca queda tapado por
                     "Aplicar" ni por el degradado del borde derecho. -->
                <button type="button" class="filter-chip filter-chip--clear" id="filter-clear"
                        aria-label="Limpiar todos los filtros">
                    Limpiar todo
                </button>

                <div class="filter-chip filter-chip--select">
                    <select id="filtro-disponibilidad" aria-label="Filtrar por disponibilidad">
                        <option value="">Disponibilidad</option>
                        <option value="Disponible">Disponible</option>
                        <option value="Apartado">Apartado</option>
                        <option value="Vendido">Vendido</option>
                        <option value="Holdback">Holdback</option>
                    </select>
                    ${CHEVRON}
                </div>

                <div class="filter-chip filter-chip--select">
                    <select id="filtro-sexo" aria-label="Filtrar por sexo">
                        <option value="">Sexo</option>
                        <option value="Macho">Macho</option>
                        <option value="Hembra">Hembra</option>
                        <option value="Sin sexar">Sin sexar</option>
                    </select>
                    ${CHEVRON}
                </div>

                <div class="filter-chip filter-chip--select">
                    <select id="filtro-anio" aria-label="Filtrar por año de nacimiento">
                        <option value="">Año</option>
                    </select>
                    ${CHEVRON}
                </div>

                <div class="filter-chip filter-chip--select">
                    <select id="filtro-orden" aria-label="Ordenar ejemplares">
                        <option value="">Ordenar</option>
                        <option value="precio-desc">Precio: alto-bajo</option>
                        <option value="precio-asc">Precio: bajo-alto</option>
                    </select>
                    ${CHEVRON}
                </div>

            </div>

            <!-- Fuera de la pista con scroll: siempre visible a la derecha -->
            <button type="button" class="filter-chip filter-chip--apply" id="filter-apply"
                    aria-label="Aplicar filtros">
                Aplicar
            </button>
        </div>
    `;

    // CAMBIO ("Volver arriba" flotante): vive en <body>, NO dentro de la
    // barra. La barra usa backdrop-filter, y cualquier ancestro con
    // backdrop-filter/transform convierte a un hijo position:fixed en
    // "fijo respecto a ese ancestro" en vez de a la pantalla.
    document.getElementById('btn-scroll-top')?.remove();
    const scrollTopBtn = document.createElement('button');
    scrollTopBtn.type = 'button';
    scrollTopBtn.id = 'btn-scroll-top';
    scrollTopBtn.className = 'btn-scroll-top';
    scrollTopBtn.title = 'Volver arriba';
    scrollTopBtn.setAttribute('aria-label', 'Volver arriba');
    scrollTopBtn.innerHTML = iconMarkup('arrowUp', 'btn-icon');
    document.body.appendChild(scrollTopBtn);

    const searchBox = container.querySelector('.filters-search');
    const bar = container.querySelector('.filters-bar');
    const track = container.querySelector('.filters-track');
    const searchInput = document.getElementById('filtro-genetica');
    const estatusSelect = document.getElementById('filtro-disponibilidad');
    const sexoSelect = document.getElementById('filtro-sexo');
    const yearSelect = document.getElementById('filtro-anio');
    const ordenSelect = document.getElementById('filtro-orden');
    const clearChip = document.getElementById('filter-clear');
    const applyChip = document.getElementById('filter-apply');

    const selects = [estatusSelect, sexoSelect, yearSelect, ordenSelect];

    // '' (opción de encabezado del chip) equivale al 'todos' de siempre.
    const valorOTodos = (el) => (el.value === '' ? 'todos' : el.value);

    const getFilterValues = () => ({
        genetica: searchInput.value.trim(),
        estatus: valorOTodos(estatusSelect),
        sexo: valorOTodos(sexoSelect),
        anio: valorOTodos(yearSelect),
        orden: ordenSelect.value
    });

    // Activa el degradado del borde derecho solo si aún hay chips por ver
    // a la derecha (2px de tolerancia por redondeos de subpíxeles).
    const actualizarIndicador = () => {
        const hayMas = track.scrollLeft + track.clientWidth < track.scrollWidth - 2;
        bar.classList.toggle('has-more', hayMas);
    };

    // Marca los chips con valor (borde rojo) y muestra/oculta "Limpiar todo".
    // Refleja lo que hay en los controles, no lo que ya se aplicó.
    const sincronizarEstado = () => {
        selects.forEach(select => {
            select.closest('.filter-chip')?.classList.toggle('is-active', select.value !== '');
        });
        const hayFiltros = searchInput.value.trim() !== '' || selects.some(s => s.value !== '');
        clearChip.classList.toggle('is-visible', hayFiltros);
        // "Limpiar todo" y los años cambian el ancho del contenido de la pista
        actualizarIndicador();
    };

    const refreshAvailableYears = async () => {
        const currentSelectedYear = yearSelect.value;
        let availableYears = [];

        try {
            availableYears = (await getAniosDisponibles(getFilterValues())) || [];
        } catch (error) {
            console.error('Error al obtener años disponibles:', error);
        }

        yearSelect.innerHTML = '';

        if (!availableYears || availableYears.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Sin años disponibles';
            yearSelect.appendChild(option);
        } else {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Año';
            yearSelect.appendChild(defaultOption);

            availableYears.forEach(y => {
                const option = document.createElement('option');
                option.value = String(y);
                option.textContent = String(y);
                yearSelect.appendChild(option);
            });

            yearSelect.value = availableYears.includes(Number(currentSelectedYear))
                ? currentSelectedYear
                : '';
        }

        sincronizarEstado();
    };

    await refreshAvailableYears();

    track.addEventListener('scroll', actualizarIndicador, { passive: true });
    if ('ResizeObserver' in window) {
        new ResizeObserver(actualizarIndicador).observe(track);
    } else {
        window.addEventListener('resize', actualizarIndicador, { passive: true });
    }
    actualizarIndicador();

    const debouncedRefresh = debounce(refreshAvailableYears, 350);

    // Cambiar un filtro NO recarga el catálogo: solo actualiza el aspecto
    // de los chips y, si afecta a los años posibles, la lista de años.
    [estatusSelect, sexoSelect].forEach(select => {
        select.addEventListener('change', () => {
            sincronizarEstado();
            refreshAvailableYears();
        });
    });
    [yearSelect, ordenSelect].forEach(select => {
        select.addEventListener('change', sincronizarEstado);
    });
    searchInput.addEventListener('input', () => {
        sincronizarEstado();
        debouncedRefresh();
    });
    searchInput.addEventListener('change', refreshAvailableYears);

    // CAMBIO (scroll al aplicar): tras aplicar, la pista vuelve a scrollLeft = 0
    // para que "Limpiar todo" (primer chip) quede a la vista. Se usa 'auto'
    // (salto inmediato) con prefers-reduced-motion, igual que "Volver arriba".
    // Antes de mover el scroll se vuelve a evaluar sincronizarEstado(), de modo
    // que "Limpiar todo" ya esté visible (display) cuando se calcula el
    // desplazamiento. En escritorio, donde la pista no desborda, no hace nada.
    const volverAlInicioDeLaPista = () => {
        sincronizarEstado();
        track.scrollTo({
            left: 0,
            behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth'
        });
    };

    // El scroll va en finally: ocurre aunque el callback falle, y no espera a
    // que termine de cargar el catálogo, así que no interfiere con el filtrado.
    const aplicar = () => {
        try {
            onApplyCallback(getFilterValues());
        } finally {
            volverAlInicioDeLaPista();
        }
    };

    applyChip.addEventListener('click', aplicar);

    // Enter dentro del buscador cuenta como pulsar "Aplicar" (acción explícita).
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            aplicar();
        }
    });

    const resetAndApply = async () => {
        searchInput.value = '';
        selects.forEach(select => { select.value = ''; });
        await refreshAvailableYears();
        aplicar();
    };

    clearChip.addEventListener('click', () => {
        // El chip se oculta al limpiar: se pasa el foco a "Aplicar" para no
        // dejar a quien navega con teclado sin foco.
        applyChip.focus({ preventScroll: true });
        resetAndApply();
    });

    window.addEventListener('clearFiltersTrigger', resetAndApply);

    window.addEventListener('scroll', () => {
        scrollTopBtn.classList.toggle('is-visible', window.scrollY > 200);
    }, { passive: true });

    // Sube hasta el buscador, de modo que se vean buscador + barra + primeras fichas.
    scrollTopBtn.addEventListener('click', () => {
        const destino = searchBox || document.getElementById('catalog-root');
        if (!destino) return;

        const top = destino.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({
            top: Math.max(top, 0),
            behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth'
        });
    });
}
