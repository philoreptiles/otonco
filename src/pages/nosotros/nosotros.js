import { renderHeader } from '../../components/common/header/header.js';
import { renderFooter } from '../../components/common/footer/footer.js';
import { renderWhatsAppFab } from '../../components/common/whatsapp-fab/whatsapp-fab.js';
import '../../styles/main.css';
import { siteConfig, applySiteTheme } from '../../site-config.js';
import '../../components/common/header/header.css';
import '../../components/common/footer/footer.css';
import '../../components/common/whatsapp-fab/whatsapp-fab.css';
import '../../styles/pages/nosotros.css';

applySiteTheme();
document.title = `Nosotros - ${siteConfig.brandName}`;

export async function renderNosotrosPage() {
    await renderHeader('header-root');
    await renderFooter('footer-root');

    const main = document.getElementById('nosotros-app');
    if (!main) return;
    
    /* CAMBIO: contenido editorial de "Sobre Otonco". Se sustituyen las
       secciones anteriores (hero en tarjeta, "Nuestros Pilares" y la
       tarjeta de registro con folio de ejemplo) por: hero + intro,
       dos bloques con encabezado numerado y un cierre con CTA. */
    main.innerHTML = `
        <!-- Hero: título de la página (único h1) y bajada -->
        <section class="nosotros-hero">
            <div class="section-container">
                <div class="about-measure reveal-on-scroll">
                    <h1>Sobre Otonco</h1>
                    <p class="nosotros-description">
                        Un proyecto dedicado a la conservación, la divulgación y la crianza responsable de reptiles en el sur de Veracruz.
                    </p>
                </div>
            </div>
        </section>

        <!-- Introducción: sin encabezado propio para no repetir el h1 -->
        <section class="about-intro" aria-label="Presentación">
            <div class="section-container">
                <p class="about-intro-text about-measure reveal-on-scroll">
                    Otonco es un proyecto dedicado a la conservación, la divulgación y la crianza responsable de reptiles en el sur de Veracruz. Nace de una visión que integra la herpetología, la biología y el estudio de la relación entre las personas y la fauna silvestre, entendiendo a las serpientes como parte vital de la naturaleza y de la memoria cultural de la región.
                </p>
            </div>
        </section>

        <!-- Bloque ¿Qué hacemos? -->
        <section class="about-block" aria-labelledby="about-que-hacemos">
            <div class="section-container about-block-inner reveal-on-scroll">
                <div class="about-head">
                    <h2 class="about-title" id="about-que-hacemos">¿Qué hacemos?</h2>
                </div>
                <p class="about-text">
                    Combinamos la crianza selectiva y regularizada de boas en un entorno de selva con actividades de capacitación comunitaria —talleres escolares sobre prevención de mordeduras y atención de la ofidiotoxicosis— y la colaboración continua con investigadores en el monitoreo de la biodiversidad local.
                </p>
            </div>
        </section>

        <!-- Bloque Nuestra trayectoria -->
        <section class="about-block" aria-labelledby="about-trayectoria">
            <div class="section-container about-block-inner reveal-on-scroll">
                <div class="about-head">
                    <h2 class="about-title" id="about-trayectoria">Nuestra trayectoria</h2>
                </div>
                <p class="about-text">
                    Con más de una década de trabajo en divulgación ambiental y gestión social, integramos conocimiento técnico, trabajo de campo y respeto por la vida silvestre. Cada ejemplar se cría con ética y dedicación, bajo criterios de bienestar animal y cumplimiento normativo.
                </p>
            </div>
        </section>

        <!-- Cierre con CTA hacia el catálogo -->
        <section class="about-cta-section">
            <div class="section-container reveal-on-scroll">
                <a href="/index.html" class="about-cta">Conoce nuestros ejemplares disponibles →</a>
            </div>
        </section>
    `;

    initScrollReveal(main);
    renderWhatsAppFab();
}

/**
 * Anima con fade + slide-up los bloques marcados con
 * ".reveal-on-scroll" la primera vez que entran al viewport. Se
 * desconecta cada elemento después de animarlo (obs.unobserve) --
 * es una entrada única, no algo que deba repetirse cada vez que el
 * usuario sube y baja por la página.
 */
function initScrollReveal(root) {
    root.querySelectorAll('.reveal-on-scroll').forEach(el => {
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        }, { threshold: 0.15 });
        obs.observe(el);
    });
}

document.addEventListener('DOMContentLoaded', renderNosotrosPage);