/**
 * src/components/common/footer/footer.js
 * CAMBIOS:
 * 1. Se quito el enlace publico a "/src/pages/admin/admin.html". El panel
 *    de administracion ahora exige inicio de sesion real con Supabase Auth,
 *    pero de todas formas no tiene sentido anunciar su URL exacta a
 *    cualquier visitante del catalogo publico -- es superficie de ataque
 *    gratuita que no aporta nada al cliente final.
 * 2. El nombre de marca, año y ubicacion vienen de site-config.js.
 * 3. Icono de Facebook (SVG inline RELLENO, .footer-social) como tercer
 *    elemento del grupo de enlaces, junto a "Ejemplares" y "Nosotros".
 *    Se presenta como una "f" solida dentro de un circulo de fondo
 *    sutil (el circulo lo dibuja footer.css, no el SVG).
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
                    <a href="https://www.facebook.com/OtoncoBoas" class="footer-social" aria-label="Facebook de Otonco" target="_blank" rel="noopener noreferrer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                        </svg>
                    </a>
                </nav>
            </div>
        </footer>
    `;
}
