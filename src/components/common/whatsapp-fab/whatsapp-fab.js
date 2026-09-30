/**
 * src/components/common/whatsapp-fab/whatsapp-fab.js
 * ---------------------------------------------------------------------
 * Botón flotante de WhatsApp, fijo en la esquina inferior derecha.
 * WhatsApp hoy solo vive en el header y en el modal -- en páginas
 * largas (ej. "Nosotros") el header ya se perdió de vista al hacer
 * scroll, así que este botón se queda siempre a la vista.
 *
 * Mismo ícono (el mismo <svg> que ya usa modal.js) y mismo número
 * (siteConfig.whatsappNumber, sin texto de mensaje predefinido, a
 * diferencia del botón del modal que sí arma un mensaje según el
 * estatus del ejemplar) -- cambiar de criador no requiere tocar este
 * archivo.
 */
import { siteConfig } from '../../../site-config.js';

export function renderWhatsAppFab() {
    // Evita duplicarlo si alguna página llega a invocarlo más de una vez.
    if (document.querySelector('.whatsapp-fab')) return;

    const fab = document.createElement('a');
    fab.href = `https://wa.me/${siteConfig.whatsappNumber}`;
    fab.target = '_blank';
    fab.rel = 'noopener noreferrer';
    fab.className = 'whatsapp-fab';
    fab.setAttribute('aria-label', 'Escribir por WhatsApp');
    fab.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.299.425 2.5 1.144 3.473l-.751 2.74 2.802-.735c.937.511 2.012.808 3.153.808 3.18 0 5.767-2.586 5.768-5.766.001-3.18-2.585-5.766-5.768-5.766zm3.327 8.2c-.145.405-.838.774-1.164.823-.326.049-.751.084-2.158-.468-1.785-.701-2.922-2.522-3.011-2.641-.088-.119-.723-.961-.723-1.832 0-.871.458-1.301.621-1.478.163-.177.355-.222.473-.222.119 0 .237 0 .341.006.109.006.255-.042.399.304.145.346.495 1.209.539 1.298.044.089.074.193.015.311-.059.119-.089.193-.177.296-.089.104-.187.232-.267.311-.089.089-.182.186-.078.365.104.178.463.765 1.001 1.244.692.617 1.275.808 1.454.897.178.089.282.074.385-.044.104-.119.444-.518.563-.696.119-.178.237-.148.399-.089.163.059 1.035.488 1.213.577.178.089.296.133.341.207.045.074.045.43-.1 0.835z"/>
        </svg>
    `;
    document.body.appendChild(fab);
}
