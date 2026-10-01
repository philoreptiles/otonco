/**
 * src/site-config.js
 * ---------------------------------------------------------------------
 * PUNTO ÚNICO DE PERSONALIZACIÓN PARA CADA CRIADOR.
 *
 * Antes de este archivo, el nombre de marca ("Escama y Colmillo"), el
 * folio SEMARNAT-PIMVS, el número de WhatsApp y el texto del footer
 * estaban repetidos y hardcodeados en varios archivos distintos
 * (header.js, footer.js, modal.js, admin.html, index.html...). Además
 * había un bug real por esa duplicación: header.js usaba un número de
 * WhatsApp de ejemplo y modal.js usaba OTRO número distinto.
 *
 * Para adaptar este proyecto a un nuevo criador, en la mayoría de los
 * casos basta con:
 *   1. Editar los valores de este archivo (incluidos colors y fonts).
 *   2. Configurar su propio proyecto de Supabase (ver .env.example).
 *
 * Los componentes (header.js, footer.js, modal.js) importan estos
 * valores en vez de tenerlos escritos directamente. Los colores y
 * fuentes se inyectan como variables CSS en tiempo de carga (ver
 * applySiteTheme() más abajo, invocada desde main.js) -- así que
 * NO hace falta tocar ningún archivo .css para cambiar la paleta
 * o la tipografía de un cliente nuevo.
 */

export const siteConfig = {
    brandName: 'Otonco',
    // Frase corta debajo del nombre de marca en el hero del catálogo
    // público (1 línea, sin punto final). Déjala en '' si no quieres
    // hero con tagline -- igual se muestra el nombre solo.
    tagline: '',
    // El "id" que le corresponde a este criador en la tabla
    // public.criadores del proyecto de Supabase compartido (ver
    // sql/esquema_inicial_proyecto_nuevo.sql). Filtra qué
    // ejemplares/especies ve el catálogo público de ESTE sitio.
    // TODOS los criadores viven en el mismo proyecto de Supabase y el
    // mismo bucket de R2 -- no es una solución temporal por el límite
    // de 2 proyectos del plan gratuito, es la arquitectura normal
    // (RLS aísla los datos por criador_id, no la cantidad de
    // proyectos). Solo se justifica un proyecto de Supabase dedicado
    // aparte si un cliente puntual exige aislamiento de infraestructura
    // por contrato/compliance, no como estrategia de crecimiento.
    criadorId: 3,
    // Mismo criador que arriba, pero en texto (coincide con el "slug"
    // de la tabla criadores). Se usa para organizar las imágenes de
    // este criador dentro de la carpeta que le corresponde en el
    // bucket de Cloudflare R2 compartido (ver worker-upload-imagenes/).
    criadorSlug: 'otonco',
    // Título de la pestaña del navegador. Si lo dejas vacío (''), se
    // usa automáticamente brandName.
    pageTitle: 'Otonco',
    // Folio de la Unidad de Manejo para la Conservación de Vida Silvestre
    // (UMA) o registro PIMVS del criador. Déjalo en cadena vacía '' si no
    // aplica y el header simplemente no mostrará esa línea.
    semarnatFolio: 'SEMARNAT-PIMVS-IN-0000-VER',
    // Número de WhatsApp en formato internacional SIN "+" ni espacios,
    // ej. 521XXXXXXXXXX para México.
    whatsappNumber: '5210000000000',
    location: 'Veracruz, México',
    footerCopyrightYear: new Date().getFullYear(),

    // Paleta semántica del cliente. Los tonos hover/oscuros derivados
    // (botones al pasar el mouse, etc.) se calculan solos a partir de
    // estos 3 colores con color-mix() en CSS -- no hace falta darlos
    // a mano.
    colors: {
        primary: '#ee2929',
        secondary: '#b84747',
        background: '#161717',
    },

    // Siempre 2 fuentes: encabezados (h1-h6) y cuerpo de texto.
    // Acepta cualquier valor válido de font-family en CSS, con sus
    // fallbacks incluidos.
    fonts: {
        heading: "'Apoc Revelations It', 'Georgia', serif",
        body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        // URL de Google Fonts que carga las 2 familias de arriba. Si
        // cambias heading/body, actualiza también esta URL (o bórrala
        // si vas a usar una fuente del sistema que no necesita carga
        // web, como Georgia o Helvetica). applySiteTheme() la inyecta
        // sola -- no hace falta tocar ningún <link> en los HTML.
        //
        // OJO: 'Apoc Revelations It' NO está en Google Fonts (parece
        // una fuente comprada/personalizada), así que por ahora esta
        // URL queda vacía y el sitio cae al fallback de main.css
        // (Georgia). Si tienes el archivo de la fuente, hay que
        // servirla con @font-face en vez de este mecanismo -- avísame
        // y lo armamos.
        googleFontsHref: '',
    },
};

/**
 * Inyecta colors y fonts de siteConfig como variables CSS en :root.
 * Se llama una sola vez al arrancar cada página (ver main.js,
 * admin-view.js, dashboard-view.js y nosotros.js), antes de que se
 * pinte cualquier componente. NO toca document.title -- cada página
 * define el suyo, porque el título varía según la sección
 * (catálogo / admin / dashboard / nosotros).
 */
export function applySiteTheme(config = siteConfig) {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', config.colors.primary);
    root.style.setProperty('--moonstone-color', config.colors.secondary);
    root.style.setProperty('--bg-color', config.colors.background);
    root.style.setProperty('--jet-dark', config.colors.background);
    root.style.setProperty('--font-primary', config.fonts.heading);
    root.style.setProperty('--font-secondary', config.fonts.body);

    // Carga las fuentes reales desde Google Fonts (o el servicio que
    // sea) -- sin esto, --font-primary/--font-secondary solo sirven si
    // el visitante ya tiene esa fuente instalada en su computadora, que
    // casi nunca es el caso. googleFontsHref es opcional: si el cliente
    // usa una fuente del sistema (Georgia, Arial, etc.) que no necesita
    // cargarse, se puede omitir.
    if (config.fonts.googleFontsHref) {
        const yaExiste = document.querySelector(`link[href="${config.fonts.googleFontsHref}"]`);
        if (!yaExiste) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = config.fonts.googleFontsHref;
            document.head.appendChild(link);
        }
    }

    // admin.html y dashboard.html tienen su propio header estático (no
    // pasan por el header.js dinámico del catálogo público, que ya usa
    // siteConfig.brandName solo). Si existe #brand-title-text en la
    // página, lo actualiza aquí para que tampoco haga falta editarlo a
    // mano por cliente. No-op en páginas que no lo tengan.
    const brandTitleEl = document.getElementById('brand-title-text');
    if (brandTitleEl) {
        brandTitleEl.textContent = config.brandName.toUpperCase();
    }
}
