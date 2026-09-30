/**
 * src/components/ui/featured/featured.js
 * ---------------------------------------------------------------------
 * Carrusel de "ejemplares destacados" arriba de los filtros.
 *
 * DISEÑO: Hero Banner -- la imagen ocupa todo el fondo con un degradado
 * oscuro encima para legibilidad del texto. El CTA de WhatsApp vive
 * dentro del propio banner, junto al precio.
 *
 * SELECCIÓN: automática -- los hasta 3 ejemplares visibles y
 * DISPONIBLES más caros (antes solo filtraba por visible_publico, así
 * que un ejemplar Apartado o Vendido carísimo podía terminar
 * "destacado" -- ahora exige estatus = 'Disponible' explícitamente).
 * Se hace una consulta directa a Supabase con orden por precio
 * descendente para no depender del ordenamiento por defecto de
 * getEjemplares().
 *
 * CAMBIO (carrusel de 3): antes se mostraba un solo destacado fijo.
 * Ahora se arman hasta 3 "slides" superpuestos (position: absolute,
 * uno encima del otro dentro de .featured-hero) y un setInterval
 * alterna cuál tiene la clase .featured-slide--active cada 3s, con
 * fundido por transición de opacity (ver featured.css). Si solo hay 1
 * o 2 ejemplares disponibles, no se arma el intervalo ni los dots --
 * el carrusel se degrada solo a una tarjeta fija, igual que antes.
 */
import { supabase } from '../../../supabase-config.js';
import { siteConfig } from '../../../site-config.js';
import { escapeHTML, safeImageUrl } from '../../../utils/security.js';
import { iconMarkup } from '../../../utils/icons.js';
import { openModal, getWhatsAppDetails } from '../modal/modal.js';

const INTERVALO_ROTACION_MS = 3000;

export async function renderFeatured(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let destacados;
    try {
        const { data, error } = await supabase
            .from('ejemplares')
            .select('*')
            .eq('visible_publico', true)
            .eq('criador_id', siteConfig.criadorId)
            .eq('estatus', 'Disponible')
            .order('precio', { ascending: false })
            .limit(3);

        if (error) throw error;
        destacados = data || [];
    } catch (error) {
        console.error('Error al cargar los ejemplares destacados:', error);
        return;
    }

    // Sitio nuevo sin inventario disponible todavía: no hay nada que destacar.
    if (destacados.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Se genera UNA sola vez y se reutiliza dentro del footer de cada
    // slide -- CAMBIO (dots junto al botón): antes vivían como bloque
    // aparte fuera de las slides (para no desvanecerse con el fade);
    // ahora que están DENTRO del footer de cada slide para quedar en
    // la misma fila que el botón de WhatsApp, se duplican a propósito
    // (una copia por slide) y CSS ya se encarga de que solo se vea/
    // clickee la copia de la slide activa (ver .featured-slide en
    // featured.css). Solo se genera si hay más de 1 destacado.
    const dotsHTML = destacados.length > 1
        ? `
            <div class="featured-hero-dots">
                ${destacados
                    .map((_, i) => `
                        <button
                            type="button"
                            class="featured-hero-dot${i === 0 ? ' featured-hero-dot--active' : ''}"
                            data-dot-index="${i}"
                            aria-label="Ver ejemplar destacado ${i + 1} de ${destacados.length}"
                        ></button>
                    `)
                    .join('')}
            </div>
        `
        : '';

    const slidesHTML = destacados
        .map((destacado, index) => {
            const precioFormat = new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: 'MXN',
                minimumFractionDigits: 2
            }).format(destacado.precio || 0);

            const especie = escapeHTML(destacado.especie || 'Reptil');
            const genetica = escapeHTML(destacado.genetica || 'Nominal');
            const sexo = escapeHTML(destacado.sexo || 'Sin sexar');
            const anio = destacado.nacimiento ? String(destacado.nacimiento).substring(0, 4) : 'N/A';
            const estatus = escapeHTML((destacado.estatus || 'Disponible').trim());
            const imagenUrl = safeImageUrl(destacado.imagen_url);

            const estatusNormalizado = (destacado.estatus || 'Disponible').trim().toLowerCase();
            const statusClass = `status-${estatusNormalizado.replace(/\s+/g, '-')}`;

            const { url: whatsappUrl, btnText: whatsappTexto } = getWhatsAppDetails(destacado);

            return `
                <div class="featured-slide${index === 0 ? ' featured-slide--active' : ''}" data-index="${index}">
                    <img src="${imagenUrl}" alt="${especie}" class="featured-hero-bg" loading="lazy" />
                    <div class="featured-hero-overlay"></div>

                    <span class="featured-hero-badge">
                        ${iconMarkup('sparkles')} Ejemplares destacados
                    </span>
                    <span class="featured-hero-status ${statusClass}">${estatus}</span>

                    <div class="featured-hero-content">
                        <span class="featured-hero-species">${especie}</span>
                        <h2 class="featured-hero-genetics">${genetica}</h2>
                        <p class="featured-hero-details">${sexo} • ${escapeHTML(anio)}</p>

                        <div class="featured-hero-footer">
                            <span class="featured-hero-price">${precioFormat}</span>
                            <div class="featured-hero-actions">
                                <a
                                    href="${whatsappUrl}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="featured-hero-btn featured-whatsapp-link"
                                >
                                    ${iconMarkup('whatsapp')} ${whatsappTexto}
                                </a>
                                ${dotsHTML}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    container.innerHTML = `
        <section class="featured-section">
            <div class="featured-hero" id="featured-card" role="button" tabindex="0">
                ${slidesHTML}
            </div>
        </section>
    `;

    const card = container.querySelector('#featured-card');
    const slides = container.querySelectorAll('.featured-slide');

    let currentIndex = 0;
    let intervalId = null;

    // CAMBIO: como ahora hay 3 copias de cada dot (una por slide),
    // no se busca por posición en una lista plana -- se busca por su
    // data-dot-index, que sí es único por índice aunque se repita
    // físicamente 3 veces en el DOM, y se actualizan las 3 copias a
    // la vez (aunque solo una sea visible en un momento dado).
    function marcarDotActivo(index, activo) {
        container
            .querySelectorAll(`.featured-hero-dot[data-dot-index="${index}"]`)
            .forEach(dot => dot.classList.toggle('featured-hero-dot--active', activo));
    }

    function irASlide(index) {
        slides[currentIndex]?.classList.remove('featured-slide--active');
        marcarDotActivo(currentIndex, false);
        currentIndex = index;
        slides[currentIndex]?.classList.add('featured-slide--active');
        marcarDotActivo(currentIndex, true);
    }

    function siguienteSlide() {
        irASlide((currentIndex + 1) % destacados.length);
    }

    if (destacados.length > 1) {
        intervalId = setInterval(siguienteSlide, INTERVALO_ROTACION_MS);

        // Pausa la rotación mientras el mouse está encima -- mismo
        // criterio que ya usa el zoom Ken Burns de featured.css, para
        // no cambiarle la tarjeta a alguien que la está leyendo o a
        // punto de darle clic al botón de WhatsApp.
        card?.addEventListener('mouseenter', () => clearInterval(intervalId));
        card?.addEventListener('mouseleave', () => {
            intervalId = setInterval(siguienteSlide, INTERVALO_ROTACION_MS);
        });

        container.querySelectorAll('.featured-hero-dot').forEach(dot => {
            dot.addEventListener('click', event => {
                event.stopPropagation();
                irASlide(Number(dot.getAttribute('data-dot-index')));
            });
        });
    }

    const abrirDetalle = () => openModal(destacados[currentIndex]);

    card?.addEventListener('click', (event) => {
        if (event.target.closest('.featured-whatsapp-link')) return;
        if (event.target.closest('.featured-hero-dot')) return;
        abrirDetalle();
    });
    card?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            abrirDetalle();
        }
    });
}