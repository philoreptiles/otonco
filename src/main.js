import './styles/main.css';
import './components/common/card/card.css';
import './components/ui/modal/modal.css';
import './components/common/whatsapp-fab/whatsapp-fab.css';
import { initApp } from './app.js';
import { renderWhatsAppFab } from './components/common/whatsapp-fab/whatsapp-fab.js';
import { siteConfig, applySiteTheme } from './site-config.js';

// Se ejecuta ANTES de DOMContentLoaded para evitar cualquier parpadeo
// con los colores/tipografía de fallback definidos en main.css.
applySiteTheme();
document.title = siteConfig.pageTitle || siteConfig.brandName;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    renderWhatsAppFab();
});