/**
 * src/components/common/footer/footer.js
 * CAMBIOS:
 * 1. Se separan los enlaces de navegación (Ejemplares, Nosotros) de los
 *    íconos sociales en dos grupos distintos, para poder apilarlos.
 * 2. Se vuelve a agregar el texto al lado de cada ícono social, con
 *    la clase .social-label (más pequeño).
 * 3. Se conservan los SVG de Instagram, YouTube y Facebook.
 */
import { siteConfig } from '../../../site-config.js';

export async function renderFooter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <footer class="site-footer">
            <div class="footer-container">
                <nav class="footer-nav">
                    <a href="/index.html" class="footer-link">Ejemplares</a>
                    <a href="/nosotros.html" class="footer-link">Nosotros</a>
                </nav>
                <div class="footer-social-group">
                    <a href="https://www.instagram.com/otoncoboas/" class="footer-social" aria-label="Instagram de Otonco" target="_blank" rel="noopener noreferrer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="social-icon">
                            <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                        </svg>
                        <span class="social-label">Instagram</span>
                    </a>
                    <a href="https://www.youtube.com/@otoncoboas" class="footer-social" aria-label="YouTube de Otonco" target="_blank" rel="noopener noreferrer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="social-icon">
                            <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
                            <polygon points="10 15 15 12 10 9 10 15"/>
                        </svg>
                        <span class="social-label">YouTube</span>
                    </a>
                    <a href="https://www.facebook.com/OtoncoBoas" class="footer-social" aria-label="Facebook de Otonco" target="_blank" rel="noopener noreferrer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="social-icon">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                        </svg>
                        <span class="social-label">Facebook</span>
                    </a>
                </div>
            </div>
        </footer>
    `;
}