import './modal.css';
import { escapeHTML, safeImageUrl } from '../../../utils/security.js';
import { siteConfig } from '../../../site-config.js';
import { iconMarkup } from '../../../utils/icons.js';
import { toggleFavorito, esFavorito } from '../../../utils/favorites.js';
import { getEjemplares } from '../../../supabase-config.js';
// CAMBIO DE SEGURIDAD: todo campo que viene de la base de datos (especie,
// genetica, sexo, estatus, imagen_url, id...) se inserta mas abajo dentro
// de `innerHTML`. Antes se interpolaba sin escapar, lo que permitia XSS
// almacenado si esos campos llegaban manipulados. Ahora se sanea con
// escapeHTML()/safeImageUrl() antes de insertarse en cualquier plantilla.

let currentList = [];
let currentIndex = 0;
let keyListenerBound = false;
let resizeListenerBound = false;

// Piso de tamaño para la genética -- por debajo de esto ya no se
// reduce más aunque el texto siga sin caber en 2 renglones (se deja
// que rompa a una 3ra línea en vez de volverse ilegible).
const GENETICA_MIN_FONT_PX = 13;

// Lista COMPLETA de ejemplares navegables (Disponible + Apartado, sin
// filtros de catálogo ni paginación). Se carga una sola vez al abrir
// la modal y alimenta tanto la navegación Anterior/Siguiente como la
// sección "Otros ejemplares" de la parte inferior.
//
// CAMBIO (se agregó Apartado): antes solo traía "Disponible". Vendido
// y Holdback siguen quedando fuera a propósito -- no tiene mucho caso
// ofrecerle a alguien navegar hacia un ejemplar ya vendido o que ni
// siquiera está a la venta.
let allNavigableEjemplares = [];
let allNavigableLoaded = false;

/**
 * Genera la URL de WhatsApp y el texto del botón según el estatus del ejemplar
 */
export function getWhatsAppDetails(ejemplar) {
    const especie = ejemplar.especie || 'ejemplar';
    const id = ejemplar.id ? `#${ejemplar.id}` : 'sin ID';
    const estatus = (ejemplar.estatus || '').toLowerCase().trim();

    let mensaje = '';
    let btnText = '';

    const marca = siteConfig.brandName;

    switch (estatus) {
        case 'disponible':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id}. ¿Continúa disponible?`;
            btnText = 'Consultar por WhatsApp';
            break;
        case 'apartado':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id} que aparece como Apartado. ¿Sigue disponible o ya fue separado?`;
            btnText = 'Preguntar por disponibilidad';
            break;
        case 'vendido':
            mensaje = `Hola, ${marca}. Vi el ejemplar ${especie} con ID ${id} pero aparece como Vendido. ¿Tienen ejemplares similares disponibles?`;
            btnText = 'Preguntar por similares';
            break;
        case 'holdback':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id} que aparece como Holdback. ¿Está disponible para venta o es de reserva?`;
            btnText = 'Consultar disponibilidad';
            break;
        default:
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id}. ¿Podrían darme más información?`;
            btnText = 'Consultar por WhatsApp';
    }

    const url = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(mensaje)}`;
    return { url, btnText };
}

/**
 * Filtra los ejemplares navegables (Disponible + Apartado), excluyendo
 * el ejemplar actualmente abierto. Trabaja sobre la lista COMPLETA
 * (allNavigableEjemplares), no sobre currentList.
 */
function getOtrosNavegables(ejemplarActual) {
    return allNavigableEjemplares.filter(ejemplar =>
        ejemplar &&
        ejemplar.id !== ejemplarActual.id
    );
}

/**
 * Carga (una sola vez) TODOS los ejemplares con estatus "Disponible" o
 * "Apartado" desde Supabase, sin aplicar filtros de catálogo ni
 * paginación.
 */
async function cargarTodosLosNavegables() {
    if (allNavigableLoaded) return;

    try {
        // Pedimos un límite alto para traer todos los navegables.
        // Si tienes muchísimos ejemplares (>1000) considera paginar
        // esta carga, pero para un catálogo de reptiles es más que suficiente.
        const resultado = await getEjemplares({ page: 1, limit: 500 }) || [];

        allNavigableEjemplares = resultado.filter(e => {
            if (!e || !e.estatus) return false;
            const estatusNorm = e.estatus.toLowerCase().trim();
            return estatusNorm === 'disponible' || estatusNorm === 'apartado';
        });

        allNavigableLoaded = true;
    } catch (error) {
        console.error('Error al cargar todos los ejemplares navegables:', error);
        allNavigableEjemplares = [];
    }
}

/**
 * Inicializa y escucha eventos globales de la modal
 */
export function initModalEvents() {
    const modalElement = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close-btn');

    if (!modalElement) return;

    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', closeModal);
        closeBtn.dataset.bound = 'true';
    }

    if (!modalElement.dataset.bound) {
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) closeModal();
        });
        modalElement.dataset.bound = 'true';
    }

    if (!keyListenerBound) {
        window.addEventListener('keydown', handleKeyPress);
        keyListenerBound = true;
    }

    if (!resizeListenerBound) {
        // CAMBIO (genética se ajusta a 2 renglones): al cambiar el
        // ancho de la ventana (o rotar el celular), el tamaño
        // "natural" por CSS puede cambiar (móvil vs. el @media de
        // escritorio) y el ancho disponible para el texto también --
        // hay que recalcular, no basta con haberlo hecho una sola vez
        // al abrir. Debounced para no recalcular en cada pixel
        // mientras se arrastra el borde de la ventana.
        let resizeTimeoutId = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeoutId);
            resizeTimeoutId = setTimeout(() => {
                const modal = document.getElementById('modal-overlay');
                if (!modal || !modal.classList.contains('is-open')) return;
                ajustarTamanoGenetica(modal.querySelector('.modal-genetics-badge'));
            }, 150);
        });
        resizeListenerBound = true;
    }
}

/**
 * Manejador de eventos de teclado (Esc, Flecha Izquierda, Flecha Derecha)
 */
function handleKeyPress(e) {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement || !modalElement.classList.contains('is-open')) return;

    if (e.key === 'Escape') {
        closeModal();
    } else if (e.key === 'ArrowLeft') {
        navigateModal('prev');
    } else if (e.key === 'ArrowRight') {
        navigateModal('next');
    }
}

/**
 * Abre la modal con el ejemplar seleccionado y el contexto del catálogo
 *
 * CAMBIO (navegación sobre TODO el catálogo visible, no solo la
 * página cargada): antes, "Anterior/Siguiente" y el contador
 * ("Ejemplar X de N") navegaban sobre `todosLosEjemplares` tal cual
 * lo pasaba catalog.js -- que por la paginación del catálogo público
 * (8 por página) solo traía los ejemplares de la página que estaba
 * cargada en el momento del clic. La sección "Otros ejemplares" de
 * abajo, en cambio, siempre usó la lista completa -- por eso ahí sí
 * aparecían todos y arriba no. Ahora, si el ejemplar abierto está
 * Disponible o Apartado, currentList pasa a ser esa misma lista
 * completa, y se busca su índice real ahí dentro. Para
 * Vendido/Holdback -- que NO forman parte de allNavigableEjemplares --
 * se conserva el comportamiento anterior (navegar sobre lo que el
 * catálogo tenía cargado, o quedar aislado si no se pasó nada), igual
 * que ya se hacía al hacer clic en un "other-card" que no estaba en
 * la lista actual.
 */
export async function openModal(ejemplar, todosLosEjemplares = [], indexActual = 0) {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement) return;

    initModalEvents();

    // Cargamos TODOS los navegables ANTES de decidir la lista de
    // navegación (antes se cargaba después, cuando currentList ya
    // había quedado fijada a la página parcial).
    await cargarTodosLosNavegables();

    const estatusEjemplar = (ejemplar.estatus || '').toLowerCase().trim();

    if ((estatusEjemplar === 'disponible' || estatusEjemplar === 'apartado') && allNavigableEjemplares.length > 0) {
        currentList = allNavigableEjemplares;
        const idxEnTodos = currentList.findIndex(e => String(e.id) === String(ejemplar.id));
        currentIndex = idxEnTodos >= 0 ? idxEnTodos : 0;
    } else {
        currentList = todosLosEjemplares.length > 0 ? todosLosEjemplares : [ejemplar];
        currentIndex = indexActual >= 0 ? indexActual : 0;
    }

    renderModalContent(currentList[currentIndex]);

    modalElement.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra la modal y restablece el scroll
 */
export function closeModal() {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement) return;

    modalElement.classList.remove('is-open');
    document.body.style.overflow = '';
}

/**
 * Reduce el font-size de .modal-genetics-badge (en pasos de 1px) hasta
 * que su contenido quepa en máximo 2 renglones, partiendo SIEMPRE del
 * tamaño que le toca por las reglas normales de CSS (1.25rem en móvil,
 * 2rem en el @media de escritorio) -- nunca se acumula un achicado
 * sobre un achicado anterior de un render previo.
 *
 * CAMBIO: genéticas largas ("ALBINO (KAHL) 50% HET ANERY T1 50% HET
 * ANERY T2") desbordaban a 3+ renglones con el tamaño fijo. Como el
 * largo del texto varía por ejemplar y no hay forma de saberlo desde
 * CSS puro, se mide en JS después de insertar el HTML: se recalcula
 * el alto máximo de "2 líneas" EN CADA vuelta del bucle (no una sola
 * vez al inicio) porque line-height es "normal" -- es decir, depende
 * del font-size actual, y ese también va bajando en cada vuelta.
 */
function ajustarTamanoGenetica(el) {
    if (!el) return;

    el.style.fontSize = '';

    let fontSizePx = parseFloat(window.getComputedStyle(el).fontSize);
    let intentos = 0;

    while (intentos < 40) {
        const lineHeightPx = parseFloat(window.getComputedStyle(el).lineHeight) || fontSizePx * 1.15;
        const maxHeightPx = (lineHeightPx * 4) + 2; // +2px de margen de redondeo

        if (el.scrollHeight <= maxHeightPx || fontSizePx <= GENETICA_MIN_FONT_PX) break;

        fontSizePx -= 1;
        el.style.fontSize = `${fontSizePx}px`;
        intentos++;
    }
}

/**
 * Actualiza el contenido con transición de opacidad y leve desplazamiento
 */
function updateModalContent(nuevoEjemplar) {
    const content = document.getElementById('modal-body-content');
    if (!content) return;

    content.classList.add('fade-out');

    setTimeout(() => {
        renderModalContent(nuevoEjemplar);
        content.classList.remove('fade-out');
        content.classList.add('fade-in');

        setTimeout(() => {
            content.classList.remove('fade-in');
        }, 300);
    }, 200);
}

/**
 * Navega al ejemplar anterior/siguiente dentro de la lista actual (circular)
 */
function navigateModal(direction) {
    if (!currentList || currentList.length <= 1) return;

    if (direction === 'prev') {
        currentIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    } else if (direction === 'next') {
        currentIndex = (currentIndex + 1) % currentList.length;
    }

    updateModalContent(currentList[currentIndex]);
}

/**
 * Renderiza la estructura interna de la modal
 */
function renderModalContent(ejemplar = {}) {
    const content = document.getElementById('modal-body-content');
    if (!content) return;

    const imagenes = [ejemplar.imagen_url, ejemplar.imagen_url_2, ejemplar.imagen_url_3]
        .filter(url => typeof url === 'string' && url.trim() !== '');

    const imagenPrincipal = safeImageUrl(imagenes[0]);

    const especie = escapeHTML(ejemplar.especie || 'Reptil');
    const genetica = escapeHTML(ejemplar.genetica || 'Nominal');
    const sexo = escapeHTML(ejemplar.sexo || 'Sin sexar');
    const estatus = escapeHTML((ejemplar.estatus || 'Disponible').trim());
    const estatusNormalizado = (ejemplar.estatus || 'Disponible').trim().toLowerCase();
    const idEjemplar = escapeHTML(ejemplar.id ? `${ejemplar.id}` : 'N/A');
    const anio = escapeHTML(ejemplar.nacimiento ? String(ejemplar.nacimiento).substring(0, 4) : 'N/A');

    const precioFormat = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0
    }).format(Number(ejemplar.precio) || 0);

    const isDisponible = estatusNormalizado === 'disponible';

    const { url: linkWhatsApp, btnText } = getWhatsAppDetails(ejemplar);

    const statusClass = escapeHTML(`status-${estatusNormalizado.replace(/\s+/g, '-')}`);
    const btnClass = isDisponible ? 'btn-available' : 'btn-unavailable';

    // Sección inferior: TODOS los navegables (Disponible + Apartado),
    // sin excluir los que no están en currentList. Al hacer clic se
    // abre un modal "aislado" con ese ejemplar si no está en
    // currentList (no debería pasar casi nunca ahora, ver openModal()).
    const otrosNavegables = getOtrosNavegables(ejemplar);

    let otrosEjemplaresHTML = '';
    if (otrosNavegables.length > 0) {
        otrosEjemplaresHTML = `
            <div class="modal-others-grid">
                ${otrosNavegables.map((item) => {
                    const itemImg = safeImageUrl(item.imagen_url);
                    const itemEspecie = escapeHTML(item.especie || 'Reptil');
                    const itemPrecio = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(Number(item.precio) || 0);
                    const itemEstatus = escapeHTML((item.estatus || 'Disponible').trim());
                    const itemEstatusClass = escapeHTML(`status-${(item.estatus || 'Disponible').trim().toLowerCase().replace(/\s+/g, '-')}`);

                    return `
                        <div class="other-card" data-id="${escapeHTML(String(item.id))}">
                            <div class="other-card-img-wrapper">
                                <img src="${itemImg}" alt="${itemEspecie}" />
                            </div>
                            <div class="other-card-info">
                                <span class="other-card-species">${itemEspecie}</span>
                                <span class="other-card-price">${itemPrecio}</span>
                                <span class="other-card-status ${itemEstatusClass}">${itemEstatus}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        otrosEjemplaresHTML = `<p class="no-others-message">No hay más ejemplares disponibles ni apartados en este momento</p>`;
    }

    content.innerHTML = `
        <div class="modal-main-layout">
            <!-- Columna Izquierda: Imagen Principal sin etiqueta flotante -->
            <div class="modal-col-left">
                <div class="modal-image-main-wrapper" id="zoom-wrapper">
                    <img id="modal-main-img" src="${imagenPrincipal}" alt="${especie}" class="modal-main-img" />
                </div>
                ${imagenes.length > 1 ? `
                    <div class="modal-thumbnails">
                        ${imagenes.map((img, idx) => {
                            const safeImg = safeImageUrl(img);
                            return `
                            <div class="modal-thumb-wrapper">
                                <img src="${safeImg}" class="modal-thumb ${idx === 0 ? 'active' : ''}" data-src="${safeImg}" alt="Miniatura ${idx + 1}" />
                            </div>
                        `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Columna Derecha: Navegación + Detalles -->
            <div class="modal-col-right">

                <!-- Cabecera -->
                <div class="modal-header-info">
                    <div class="modal-header-titles">
                        <h1 class="modal-title-species">${especie}</h1>
                        <span class="modal-genetics-badge">${genetica}</span>
                    </div>
                    <div class="modal-quick-actions">
                        <button type="button" class="btn-icon-round btn-favorito ${esFavorito(ejemplar.id) ? 'is-active' : ''}" id="btn-favorito" aria-label="Guardar en favoritos" aria-pressed="${esFavorito(ejemplar.id)}">
                            ${iconMarkup('heart')}
                        </button>
                        <button type="button" class="btn-icon-round btn-compartir" id="btn-compartir" aria-label="Compartir ejemplar">
                            ${iconMarkup('share')}
                        </button>
                    </div>
                </div>

                <!-- Cuadrícula de Datos (Estatus visible aquí) -->
                <div class="modal-details-grid">
                    <div class="detail-item">
                        <label>SEXO</label>
                        <span>${sexo}</span>
                    </div>
                    <div class="detail-item">
                        <label>AÑO NACIMIENTO</label>
                        <span>${anio}</span>
                    </div>
                    <div class="detail-item">
                        <label>ID EJEMPLAR</label>
                        <span>${idEjemplar}</span>
                    </div>
                    <div class="detail-item">
                        <label>ESTATUS</label>
                        <span class="detail-status-text ${statusClass}">${estatus}</span>
                    </div>
                </div>

                <!-- Precio -->
                <div class="modal-price-box">
                    <span class="modal-price-label">PRECIO:</span>
                    <span class="modal-price">${precioFormat} MXN</span>
                </div>

                <!-- Botón de WhatsApp -->
                <a href="${linkWhatsApp}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp ${btnClass}">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.299.425 2.5 1.144 3.473l-.751 2.74 2.802-.735c.937.511 2.012.808 3.153.808 3.18 0 5.767-2.586 5.768-5.766.001-3.18-2.585-5.766-5.768-5.766zm3.327 8.2c-.145.405-.838.774-1.164.823-.326.049-.751.084-2.158-.468-1.785-.701-2.922-2.522-3.011-2.641-.088-.119-.723-.961-.723-1.832 0-.871.458-1.301.621-1.478.163-.177.355-.222.473-.222.119 0 .237 0 .341.006.109.006.255-.042.399.304.145.346.495 1.209.539 1.298.044.089.074.193.015.311-.059.119-.089.193-.177.296-.089.104-.187.232-.267.311-.089.089-.182.186-.078.365.104.178.463.765 1.001 1.244.692.617 1.275.808 1.454.897.178.089.282.074.385-.044.104-.119.444-.518.563-.696.119-.178.237-.148.399-.089.163.059 1.035.488 1.213.577.178.089.296.133.341.207.045.074.045.43-.1 0.835z"/>
                    </svg>
                    ${btnText}
                </a>

                <!-- Barra de Navegación -->
                <div class="modal-nav-bar">
                    <button type="button" class="modal-nav-btn" id="modal-prev-btn" aria-label="Anterior">
                        ‹ Anterior
                    </button>
                    <span class="modal-counter">Ejemplar ${currentIndex + 1} de ${currentList.length}</span>
                    <button type="button" class="modal-nav-btn" id="modal-next-btn" aria-label="Siguiente">
                        Siguiente ›
                    </button>
                </div>

            </div>
        </div>

        <!-- Otros Ejemplares Disponibles -->
        <div class="modal-others-section">
            <h3 class="modal-others-title">Otros ejemplares disponibles y apartados</h3>
            ${otrosEjemplaresHTML}
        </div>
    `;

    ajustarTamanoGenetica(content.querySelector('.modal-genetics-badge'));

    // Activar Zoom Interactivo (Lupa)
    const zoomWrapper = content.querySelector('#zoom-wrapper');
    const mainImg = content.querySelector('#modal-main-img');
    setupInteractiveZoom(zoomWrapper, mainImg);

    // Activar selector de imágenes miniatura
    const thumbs = content.querySelectorAll('.modal-thumb');
    thumbs.forEach(thumb => {
        thumb.onclick = () => {
            thumbs.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            if (mainImg) {
                mainImg.style.opacity = '0.4';
                setTimeout(() => {
                    mainImg.src = thumb.dataset.src;
                    mainImg.style.opacity = '1';
                }, 150);
            }
        };
    });

    // Eventos de Navegación
    const prevBtn = content.querySelector('#modal-prev-btn');
    const nextBtn = content.querySelector('#modal-next-btn');

    if (prevBtn) prevBtn.onclick = () => navigateModal('prev');
    if (nextBtn) nextBtn.onclick = () => navigateModal('next');

    // Eventos para seleccionar otros ejemplares disponibles.
    // Ahora se busca el ejemplar por ID en TODA la lista de disponibles.
    // Si no está en currentList, se abre en modo "aislado" (solo ese ejemplar).
    const otherCards = content.querySelectorAll('.other-card');
    otherCards.forEach(card => {
        card.onclick = () => {
            const id = card.dataset.id;
            const item = allNavigableEjemplares.find(e => String(e.id) === String(id));
            if (!item) return;

            const idxEnCurrent = currentList.findIndex(e => String(e.id) === String(id));

            if (idxEnCurrent >= 0) {
                // Está en la lista actual: navegamos normal
                currentIndex = idxEnCurrent;
                updateModalContent(currentList[currentIndex]);
            } else {
                // No está en la lista filtrada: abrimos "aislado"
                currentList = [item];
                currentIndex = 0;
                updateModalContent(item);
            }
        };
    });

    // Favorito: guarda/quita el id en localStorage y refleja el estado
    // en el ícono al instante (ver utils/favorites.js -- no necesita
    // backend ni cuenta del visitante).
    const favoritoBtn = content.querySelector('#btn-favorito');
    if (favoritoBtn) {
        favoritoBtn.onclick = () => {
            const activo = toggleFavorito(ejemplar.id);
            favoritoBtn.classList.toggle('is-active', activo);
            favoritoBtn.setAttribute('aria-pressed', String(activo));
        };
    }

    // Compartir: usa el share sheet nativo si el navegador lo soporta
    // (celulares, la mayoría de navegadores modernos); si no, cae a
    // copiar el link al portapapeles y avisa brevemente en el propio
    // botón, sin depender de ningún sistema de notificaciones extra.
    const compartirBtn = content.querySelector('#btn-compartir');
    if (compartirBtn) {
        compartirBtn.onclick = () => compartirEjemplar(ejemplar, compartirBtn);
    }
}

/**
 * Comparte el ejemplar actual: share sheet nativo si existe, o copiar
 * el link al portapapeles como respaldo.
 */
async function compartirEjemplar(ejemplar, boton) {
    const url = `${location.origin}${location.pathname}?ejemplar=${ejemplar.id}`;
    const titulo = `${ejemplar.especie || 'Reptil'} - ${ejemplar.genetica || 'Nominal'}`;

    try {
        if (navigator.share) {
            await navigator.share({ title: titulo, url });
            return;
        }
        await navigator.clipboard.writeText(url);
        mostrarFeedbackBoton(boton, '¡Copiado!');
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Error al compartir:', error);
        }
    }
}

/**
 * Feedback momentáneo dentro del propio botón (sin depender de un
 * sistema de toasts que el catálogo público no tiene, a diferencia
 * del admin).
 */
function mostrarFeedbackBoton(boton, texto) {
    const original = boton.innerHTML;
    boton.classList.add('is-confirmado');
    boton.innerHTML = `<span class="btn-feedback-text">${texto}</span>`;

    setTimeout(() => {
        boton.innerHTML = original;
        boton.classList.remove('is-confirmado');
    }, 1500);
}

/**
 * Lupa interactiva que sigue la posición del cursor
 */
function setupInteractiveZoom(wrapper, img) {
    if (!wrapper || !img) return;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
        wrapper.onclick = () => {
            wrapper.classList.toggle('is-zoomed');
            if (wrapper.classList.contains('is-zoomed')) {
                img.style.transform = 'scale(1.8)';
                img.style.transformOrigin = 'center center';
            } else {
                img.style.transform = 'scale(1)';
            }
        };
        return;
    }

    wrapper.onmousemove = (e) => {
        const rect = wrapper.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        img.style.transformOrigin = `${x}% ${y}%`;
        img.style.transform = 'scale(2)';
    };

    wrapper.onmouseleave = () => {
        img.style.transform = 'scale(1)';
        setTimeout(() => {
            img.style.transformOrigin = 'center center';
        }, 200);
    };
}