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
    
    main.innerHTML = `
        <section class="nosotros-hero">
            <div class="section-container">
                <div class="hero-card reveal-on-scroll">
                    <span class="hero-subtitle">Criadero Especializado</span>
                    <h1>Sobre Otonco</h1>
                    <p class="nosotros-description">
                        Somos un criadero especializado en el género <strong>Boa</strong>, ubicado en Xalapa, Veracruz. 
                        Con más de 10 años de experiencia, nos dedicamos a la reproducción ética y conservación de Boa sigma e imperator, 
                        ofreciendo ejemplares de alta calidad genética y sanidad.
                    </p>
                </div>
            </div>
        </section>

        <section class="nosotros-valores-section">
            <div class="section-container">
                <h2 class="section-title reveal-on-scroll">Nuestros Pilares</h2>
                <div class="nosotros-valores">
                    <div class="valor-card reveal-on-scroll">
                        <div class="valor-icon"><i class="fa-solid fa-dna"></i></div>
                        <h3>Calidad genética</h3>
                        <p>Trabajamos con líneas genéticas seleccionadas para garantizar ejemplares sanos y con características excepcionales.</p>
                    </div>

                    <div class="valor-card reveal-on-scroll">
                        <div class="valor-icon"><i class="fa-solid fa-leaf"></i></div>
                        <h3>Ética y conservación</h3>
                        <p>Nuestro compromiso es con el bienestar animal y la conservación de la especie, siguiendo los más altos estándares éticos.</p>
                    </div>

                    <div class="valor-card reveal-on-scroll">
                        <div class="valor-icon"><i class="fa-solid fa-handshake"></i></div>
                        <h3>Confianza y profesionalismo</h3>
                        <p>Contamos con registro ante SEMARNAT y ofrecemos asesoría especializada a nuestros clientes.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="nosotros-registro-section">
            <div class="registro-card reveal-on-scroll">
                <div class="registro-badge"><i class="fa-solid fa-shield-halved"></i></div>
                <h2>Unidad de Manejo Autorizada</h2>
                <p class="registro-number">SEMARNAT-PIMVS-IN-0000-VER</p>
                <p class="registro-text">Criadero registrado ante la Secretaría de Medio Ambiente y Recursos Naturales</p>
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