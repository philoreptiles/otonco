/**
 * src/components/common/header/header.js
 * CAMBIO: el nombre de marca, el folio SEMARNAT y el numero de WhatsApp
 * ahora vienen de src/site-config.js en vez de estar escritos aqui, para
 * que cambiarlos entre criadores no requiera tocar este componente.
 *
 * CAMBIO (logo): el texto de marca y el subtitulo legal se sustituyeron
 * por el logo PNG (./img/logo.png). Sus estilos viven en header.css
 * (.logo-link / .logo-img).
 *
 * CAMBIO (texto): se agrega "Otonco PIMVS" a la derecha del logo
 * (.logo-text), dentro del mismo enlace.
 */
import { siteConfig } from '../../../site-config.js';

export async function renderHeader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <header class="site-header">
            <div class="header-container">
                <a href="index.html" class="logo-link" aria-label="Otonco PIMVS">
                    <img src="./img/otonco.png" alt="Otonco" class="logo-img">
                    <span class="logo-text">Otonco</span>
                </a>
                <nav class="header-nav">
                    <a href="/index.html" class="nav-btn">Ejemplares</a>
                    <a href="/nosotros.html" class="nav-btn">Nosotros</a>
                    <a href="https://wa.me/${siteConfig.whatsappNumber}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn">
                        <span>WhatsApp</span>
                    </a>
                </nav>
            </div>
        </header>
    `;
}
