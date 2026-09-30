import { supabase, getEspecies, crearEspecie, getMiCriadorId } from '../../supabase-config.js';
import { compressImage } from '../../utils/image-compressor.js';
import { escapeHTML, safeImageUrl } from '../../utils/security.js';
import { siteConfig, applySiteTheme } from '../../site-config.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { validarImagenParaSubir } from '../../utils/image-validation.js';

applySiteTheme();
document.title = `Panel de Administración - ${siteConfig.brandName}`;

// Limites de validacion para archivos subidos por el formulario.
// MAX_RAW_FILE_SIZE es el limite del archivo ORIGINAL (antes de comprimir);
// existe para no intentar procesar fotos absurdamente grandes en el navegador
// del criador (celulares modernos pueden generar fotos de 10-20MB).
const MAX_RAW_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

// ==========================================
// VARIABLES GLOBALES
// ==========================================

let currentFilteredData = [];
let editingEjemplarId = null;

// Estado de las 3 imágenes MIENTRAS se edita un ejemplar -- separado
// de lo que ya está guardado en Supabase (el objeto `ejemplar` que
// llega a openEditModal) para poder reflejar un "hacer principal"
// (ver hacerImagenPrincipal) al instante en los 3 previews, sin tener
// que guardar todavía. imagenesReordenadas indica si hubo al menos un
// swap, para que handleEditSubmit sepa que debe mandar las 3 URLs a
// Supabase aunque no se haya subido ningún archivo nuevo.
let imagenesEditando = { url1: null, url2: null, url3: null };
let imagenesReordenadas = false;
let showingAll = false;

// Búsqueda unificada: filtra currentFilteredData en el navegador, sin
// volver a consultar Supabase por cada letra escrita.
let searchQuery = '';

// Vistas guardadas (filtros + búsqueda con nombre) y columnas ocultas
// de la tabla de inventario. Viven en localStorage: son preferencias
// de ESTE navegador/dispositivo, no datos del negocio, así que no
// tiene sentido guardarlas en Supabase.
const VISTAS_STORAGE_KEY = 'eyc_vistas_guardadas_inventario';
const COLUMNAS_STORAGE_KEY = 'eyc_columnas_ocultas_inventario';
let vistasGuardadas = [];

// Columnas que el criador puede mostrar/ocultar en la tabla. "id" y
// "acciones" no están aquí a propósito: son la identidad del registro
// y los botones de editar/eliminar, siempre deben verse.
const COLUMNAS_CONFIG = [
    { key: 'imagen', label: 'Imagen' },
    { key: 'especie', label: 'Especie' },
    { key: 'genetica', label: 'Genética' },
    { key: 'sexo', label: 'Sexo' },
    { key: 'etapa', label: 'Etapa' },
    { key: 'anio', label: 'Año' },
    { key: 'precio', label: 'Precio' },
    { key: 'estatus', label: 'Estatus' },
    { key: 'publico', label: 'Público' },
];

// Cache en memoria de especies (para llenar selects sin disparar una
// consulta nueva cada vez que se abre un formulario).
let especiesCache = [];


// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    initAuthListener();

    setupDragAndDrop('drop-zone-1', 'imagen1', 'preview-1');
    setupDragAndDrop('drop-zone-2', 'imagen2', 'preview-2');
    setupDragAndDrop('drop-zone-3', 'imagen3', 'preview-3');

    setupFormListeners();
    setupEditModalListeners();
    setupEspeciesFormListener();
    setupSearchListener();
    setupSavedViewsListeners();
    setupColumnConfigListeners();

});


// ==========================================
// AUTENTICACIÓN
// ==========================================

async function initAuthListener() {

    const loginForm = document.getElementById('login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const {
        data: { session }
    } = await supabase.auth.getSession();

    updateUI(session);

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUI(session);
    });
}


async function handleLogin(event) {

    event.preventDefault();

    const loginErrorMsg = document.getElementById('login-error-msg');
    const btnLogin = document.getElementById('btn-login');

    loginErrorMsg?.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.textContent = 'Iniciando sesión...';
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error && loginErrorMsg) {
        loginErrorMsg.textContent = 'Credenciales inválidas. Verifica tu correo y contraseña.';
        loginErrorMsg.classList.remove('hidden');
    }

    if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar Sesión';
    }
}


function updateUI(session) {

    const loginSection = document.getElementById('login-section');
    const adminDashboard = document.getElementById('admin-dashboard');
    const authHeaderAction = document.getElementById('auth-header-action');

    if (session) {
        loginSection?.classList.add('hidden');
        adminDashboard?.classList.remove('hidden');

        if (authHeaderAction) {
            authHeaderAction.innerHTML = `
                <button
                    id="btn-logout"
                    class="btn-secondary-premium"
                >
                    Cerrar sesión
                </button>
            `;

            document
                .getElementById('btn-logout')
                ?.addEventListener('click', () => supabase.auth.signOut());
        }

        resolverMiCriadorId();
        loadDashboardData();

    } else {
        loginSection?.classList.remove('hidden');
        adminDashboard?.classList.add('hidden');
        miCriadorId = null;

        if (authHeaderAction) {
            authHeaderAction.innerHTML = '';
        }
    }
}

// Multi-tenencia: se resuelve una sola vez por sesión iniciada, y se
// reutiliza en cada alta de ejemplar/especie (ver handleAddEjemplar y
// handleAgregarEspecie). Si no coincide con el criadorId de
// site-config.js, algo está mal configurado (ej. usuario admin de un
// cliente entrando al sitio de otro) -- se avisa en vez de fallar
// en silencio.
let miCriadorId = null;

async function resolverMiCriadorId() {
    miCriadorId = await getMiCriadorId();

    if (miCriadorId && miCriadorId !== siteConfig.criadorId) {
        console.warn(
            `El usuario autenticado pertenece al criador_id ${miCriadorId}, ` +
            `pero este sitio (site-config.js) está configurado para criadorId ` +
            `${siteConfig.criadorId}. Revisa que este panel corresponda al ` +
            `cliente correcto.`
        );
        showAlert(
            'Este usuario no corresponde al criador configurado en este sitio. Contacta soporte antes de guardar cambios.',
            'error'
        );
    }
}


// ==========================================
// ESPECIES (catálogo normalizado)
// ==========================================
//
// Reemplaza el antiguo campo de texto libre "especie" por un catálogo
// real. Se carga una sola vez por sesión de Control y se reutiliza en
// tres lugares: el select del formulario de alta, el select del modal
// de edición, y el filtro de inventario -- así el criador nunca vuelve
// a escribir el nombre de la especie a mano.

async function loadEspecies() {
    especiesCache = await getEspecies();
    populateEspecieSelects();
}

/**
 * Nombre real de la especie de un ejemplar, resuelto por especie_id
 * contra especiesCache (ya cargado por loadEspecies()). Si el registro
 * es viejo y todavía no tiene especie_id asignado, cae de vuelta al
 * campo de texto libre "especie" para no perder el dato (mismo criterio
 * que ya usa el Dashboard).
 */
function resolverEspecieNombre(item) {
    if (item.especie_id != null) {
        const especie = especiesCache.find(e => e.id === item.especie_id);
        if (especie) return especie.nombre;
    }
    return (item.especie || 'N/A').trim() || 'N/A';
}

function populateEspecieSelects() {

    const opciones = especiesCache
        .map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`)
        .join('');

    const selectAdd = document.getElementById('especie_id');
    if (selectAdd) {
        selectAdd.innerHTML = especiesCache.length
            ? `<option value="">Selecciona una especie</option>${opciones}`
            : `<option value="">Registra una especie primero</option>`;
    }

    const selectEdit = document.getElementById('edit-especie_id');
    if (selectEdit) {
        selectEdit.innerHTML = especiesCache.length
            ? opciones
            : `<option value="">Registra una especie primero</option>`;
    }

    const selectFiltro = document.getElementById('filter-especie_id');
    if (selectFiltro) {
        selectFiltro.innerHTML = `<option value="">Todas</option>${opciones}`;
    }
}

function setupEspeciesFormListener() {

    const form = document.getElementById('add-especie-form');
    form?.addEventListener('submit', async event => {
        event.preventDefault();

        const nombreInput = document.getElementById('especie-nombre');

        const nombre = nombreInput?.value.trim();

        if (!nombre) {
            showAlert('El nombre de la especie es obligatorio.', 'error');
            return;
        }

        if (!miCriadorId) {
            showAlert('No se pudo confirmar tu cuenta todavía. Espera un momento e intenta de nuevo.', 'error');
            return;
        }

        // Chequeo en el cliente contra especiesCache (ya cargado): como la
        // ficha ya no muestra la lista de especies, este es el único lugar
        // donde el criador se entera de que ya la había dado de alta.
        // Comparación insensible a mayúsculas para que "Boa constrictor" y
        // "boa constrictor" cuenten como la misma especie.
        const yaExiste = especiesCache.some(
            e => e.nombre.trim().toLowerCase() === nombre.toLowerCase()
        );
        if (yaExiste) {
            showAlert(`"${nombre}" ya ha sido registrada.`, 'error');
            return;
        }

        try {
            await crearEspecie(nombre, miCriadorId);
            showAlert(`Especie "${nombre}" agregada correctamente.`, 'success');
            form.reset();
            await loadEspecies();

        } catch (error) {
            console.error('Error al crear especie:', error);
            // Por si dos pestañas la agregan casi al mismo tiempo y el
            // chequeo de arriba no alcanzó a detectarlo: Postgres avisa
            // con el código 23505 (unique_violation) si la tabla tiene esa
            // restricción.
            if (error.code === '23505') {
                showAlert(`"${nombre}" ya ha sido registrada.`, 'error');
            } else {
                showAlert(friendlyErrorMessage(error, { entidad: 'especie', idIntentado: nombre }), 'error');
            }
        }
    });
}


// ==========================================
// FORMULARIOS
// ==========================================

function setupFormListeners() {

    const filterForm = document.getElementById('filter-form');
    const btnResetFilters = document.getElementById('btn-reset-filters');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const addForm = document.getElementById('add-ejemplar-form');
    const btnToggleInventory = document.getElementById('btn-toggle-inventory');

    filterForm?.addEventListener('submit', event => {
        event.preventDefault();

        showingAll = false;
        loadFullInventory(leerFiltrosActuales());
    });

    btnResetFilters?.addEventListener('click', () => {
        showingAll = false;
        filterForm?.reset();

        searchQuery = '';
        const inputBusqueda = document.getElementById('filter-busqueda');
        if (inputBusqueda) inputBusqueda.value = '';

        loadFullInventory();
    });

    btnExportCsv?.addEventListener('click', () => {
        const filename = getCSVFilename();
        downloadCSV(filtrarPorBusqueda(currentFilteredData), filename);
    });

    btnToggleInventory?.addEventListener('click', () => {
        showingAll = !showingAll;
        renderInventoryTable();
    });

    addForm?.addEventListener('submit', handleAddEjemplar);
}


// Nota: las tarjetas de "Total ejemplares / Disponibles / Valor
// disponible / Apartados / Vendidos / Holdbacks" que vivían aquí se
// quitaron de Control -- esos mismos conteos ya se ven en el
// Dashboard (Estatus del inventario), que es donde vive el resto de
// las estadísticas del negocio. "Valor disponible" (suma de precio de
// lo Disponible) no tenía un lugar equivalente en el Dashboard; si se
// vuelve a necesitar, es la cifra que habría que reintroducir ahí en
// vez de aquí.


// ==========================================
// CSV
// ==========================================

function downloadCSV(data, filename = 'inventario.csv') {

    if (!data || data.length === 0) {
        showAlert('No hay datos disponibles para exportar.', 'error');
        return;
    }

    const headers = [
        'ID',
        'Especie',
        'Genética',
        'Sexo',
        'Etapa',
        'Año',
        'Longitud (cm)',
        'Peso (g)',
        'Precio',
        'Estatus',
        'Visible en catálogo',
        'Fecha Registro'
    ];

    const rows = data.map(ejemplar => [
        `"${ejemplar.id || ''}"`,
        `"${ejemplar.especie || ''}"`,
        `"${ejemplar.genetica || ''}"`,
        `"${ejemplar.sexo || ''}"`,
        `"${ejemplar.etapa || ''}"`,
        ejemplar.nacimiento || '',
        ejemplar.longitud ?? '',
        ejemplar.peso_gramos ?? '',
        ejemplar.precio || 0,
        `"${ejemplar.estatus || ''}"`,
        ejemplar.visible_publico === false ? 'No' : 'Sí',
        ejemplar.created_at ? new Date(ejemplar.created_at).toLocaleDateString() : ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}


function getCSVFilename() {

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `inventario_${year}-${month}-${day}.csv`;
}


// ==========================================
// DRAG & DROP
// ==========================================

function setupDragAndDrop(zoneId, inputId, previewId) {

    const dropZone = document.getElementById(zoneId);
    const fileInput = document.getElementById(inputId);
    const previewContainer = document.getElementById(previewId);

    if (!dropZone || !fileInput || !previewContainer) {
        return;
    }

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', event => {
        const files = event.dataTransfer.files;

        if (files.length > 0) {
            fileInput.files = files;
            handleFilePreview(files[0], previewContainer, dropZone);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFilePreview(fileInput.files[0], previewContainer, dropZone);
        }
    });
}


// CAMBIO: la validación del archivo ahora delega en validarImagenParaSubir()
// (image-validation.js), que detecta HEIC/HEIF por MAGIC BYTES en vez de
// por file.type. En iOS el MIME a veces viene vacío, y el chequeo viejo
// basado en regex no atrapaba esos archivos: llegaban hasta el final del
// formulario y reventaban al guardar (o peor, se subían crudos y se veían
// rotos en el catálogo público). Ahora se rechazan aquí mismo, al
// seleccionarlos, con un mensaje que explica cómo convertir la foto.
async function handleFilePreview(file, previewContainer, dropZone) {

    const validacion = await validarImagenParaSubir(file, MAX_RAW_FILE_SIZE);

    if (!validacion.ok) {
        showAlert(validacion.mensaje, 'error');

        // Limpiar el input para que el usuario no reintente con el
        // mismo archivo creyendo que ya se seleccionó algo válido.
        const input = dropZone?.querySelector('input[type="file"]');
        if (input) input.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {
        previewContainer.innerHTML = `
            <img src="${event.target.result}" class="preview-thumb" alt="Vista previa">
            <button type="button" class="btn-change-img">Cambiar imagen</button>
        `;

        previewContainer.classList.remove('hidden');
        dropZone.style.display = 'none';

        previewContainer
            .querySelector('.btn-change-img')
            ?.addEventListener('click', () => {
                previewContainer.classList.add('hidden');
                previewContainer.innerHTML = '';
                dropZone.style.display = 'flex';

                const input = dropZone.querySelector('input');
                if (input) {
                    input.value = '';
                }
            });
    };

    reader.readAsDataURL(file);
}


// ==========================================
// SUBIR IMAGEN A CLOUDFLARE R2 (vía Worker)
// ==========================================
//
// CAMBIO: antes esto subía directo a Supabase Storage. Supabase
// Storage cobra por almacenamiento Y por transferencia (egress);
// Cloudflare R2 no cobra egress, así que las imágenes (lo que más
// pesa de este proyecto) ahora viven ahí. Como las credenciales de
// R2 no pueden viajar en el código del navegador, la subida pasa por
// un Worker (ver worker-upload-imagenes/) que valida la sesión de
// Supabase de quien sube antes de aceptar el archivo. Ver
// worker-upload-imagenes/README.md para configurarlo.
//
// La compresión (JPEG, hasta 1280px) sigue igual que antes -- eso
// no cambia por mover el almacenamiento.

const UPLOAD_WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL;

// CAMBIO CRÍTICO (uploadImage): antes, cualquier fallo de compresión
// caía al fallback de "subir el archivo original sin comprimir". Eso
// convertía un HEIC no detectado (file.type vacío en iOS) en una
// imagen rota subida a R2 en silencio. Ahora:
//   1. Se valida por magic bytes ANTES de tocar nada. Si es HEIC/HEIF/
//      AVIF, corta aquí con el mensaje accionable.
//   2. Si compressImage falla con code 'FORMATO_NO_DECODIFICABLE', NO
//      se sube el original -- se propaga el error.
//   3. Solo se cae al fallback de "subir sin comprimir" cuando el
//      formato SÍ es decodificable y el fallo fue por otra razón
//      (navegador viejo, memoria, etc.).
async function uploadImage(file, ejemplarId = null) {

    const validacion = await validarImagenParaSubir(file, MAX_RAW_FILE_SIZE);
    if (!validacion.ok) {
        throw new Error(validacion.mensaje);
    }

    if (!UPLOAD_WORKER_URL) {
        throw new Error(
            'Falta configurar VITE_UPLOAD_WORKER_URL en el .env. ' +
            'Revisa worker-upload-imagenes/README.md.'
        );
    }

    // Comprime a JPEG antes de subir.
    let uploadBlob = file;
    let fileExt = file.name.split('.').pop();

    try {
        uploadBlob = await compressImage(file, 1280, 1280, 0.78);
        fileExt = 'jpg';
    } catch (compressionError) {
        if (compressionError?.code === 'FORMATO_NO_DECODIFICABLE') {
            // No debería llegar aquí (ya validamos arriba), pero si
            // por lo que sea llega, NO subimos el original crudo.
            throw new Error(validacion.mensaje || compressionError.message);
        }
        console.warn('No se pudo comprimir la imagen, se subirá sin comprimir:', compressionError);
    }

    const prefix = ejemplarId ? `${ejemplarId}_` : '';
    const fileName = `${prefix}${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    // Prefijo por criador: varios clientes comparten el mismo bucket de
    // R2 (igual que comparten el proyecto de Supabase), así que cada
    // quien tiene su propia "carpeta" dentro del bucket.
    const filePath = `${siteConfig.criadorSlug}/ejemplares/${fileName}`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.');
    }

    const formData = new FormData();
    formData.append('file', uploadBlob, fileName);
    formData.append('path', filePath);

    let response;
    try {
        response = await fetch(UPLOAD_WORKER_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: formData
        });
    } catch (networkError) {
        throw new Error('No se pudo conectar con el servicio de imágenes. Revisa tu conexión.');
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo subir la imagen.');
    }

    const { url } = await response.json();
    return url;
}


// ==========================================
// MODAL DE EDICIÓN
// ==========================================

function openEditModal(ejemplar) {

    const modal = document.getElementById('edit-modal');

    if (!modal || !ejemplar || !ejemplar.id) {
        showAlert('No se encontraron los datos para editar este ejemplar.', 'error');
        return;
    }

    editingEjemplarId = ejemplar.id;

    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value ?? '';
        }
    };

    setValue('edit-id', ejemplar.id);

    const idDisplay = document.getElementById('edit-id-display');
    if (idDisplay) {
        idDisplay.textContent = ejemplar.id ?? '—';
    }

    setValue('edit-genetica', ejemplar.genetica || '');
    setValue('edit-sexo', ejemplar.sexo || 'No sexado');
    setValue('edit-etapa', ejemplar.etapa || 'Cría');
    setValue('edit-nacimiento', ejemplar.nacimiento ?? '');
    setValue('edit-longitud', ejemplar.longitud ?? '');
    setValue('edit-peso_gramos', ejemplar.peso_gramos ?? '');
    setValue('edit-precio', ejemplar.precio ?? '');
    setValue('edit-estatus', ejemplar.estatus || 'Disponible');
    setValue('edit-notas', ejemplar.notas || '');

    const especieSelect = document.getElementById('edit-especie_id');
    if (especieSelect) especieSelect.value = ejemplar.especie_id ?? '';

    const visibleCheckbox = document.getElementById('edit-visible_publico');
    if (visibleCheckbox) visibleCheckbox.checked = ejemplar.visible_publico !== false;

    imagenesEditando = {
        url1: ejemplar.imagen_url || null,
        url2: ejemplar.imagen_url_2 || null,
        url3: ejemplar.imagen_url_3 || null
    };
    imagenesReordenadas = false;
    refrescarPreviewsImagenes();

    resetNewImagePreviews();

    ['1', '2', '3'].forEach(num => {
        const imgInput = document.getElementById(`edit-imagen-${num}`);
        if (imgInput) imgInput.value = '';
    });

    const title = document.getElementById('edit-modal-title');
    if (title) {
        title.textContent = `Editar ${ejemplar.id} (${ejemplar.especie || 'Ejemplar'})`;
    }

    modal.dataset.ejemplarId = ejemplar.id;
    modal.classList.remove('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    document.body.classList.add('modal-open');
}


function setupCurrentImage(imageId, emptyId, url) {

    const img = document.getElementById(imageId);
    const empty = document.getElementById(emptyId);

    if (!img || !empty) {
        return;
    }

    if (url) {
        img.src = url;
        img.style.display = 'block';
        empty.style.display = 'none';
    } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        empty.style.display = 'block';
    }
}


/**
 * Repinta los 3 previews de "imagen actual" a partir de
 * `imagenesEditando` -- se llama al abrir el modal y otra vez cada
 * vez que hacerImagenPrincipal() hace un swap, para que se vea al
 * instante sin tener que guardar primero.
 */
function refrescarPreviewsImagenes() {
    setupCurrentImage('edit-imagen-actual-1', 'edit-imagen-empty-1', imagenesEditando.url1);
    setupCurrentImage('edit-imagen-actual-2', 'edit-imagen-empty-2', imagenesEditando.url2);
    setupCurrentImage('edit-imagen-actual-3', 'edit-imagen-empty-3', imagenesEditando.url3);
}


/**
 * Intercambia la imagen del slot 2 o 3 con la del slot 1 (la que se
 * usa como portada en la card del catálogo público). No sube ni
 * borra nada en Storage -- solo reordena qué URL va en qué columna,
 * así que es prácticamente instantáneo. El intercambio se vuelve
 * definitivo hasta que se le da "Guardar cambios" (ver
 * handleEditSubmit / imagenesReordenadas).
 */
function hacerImagenPrincipal(slot) {
    const key = `url${slot}`;

    if (!imagenesEditando[key]) return; // slot vacío, no hay nada que subir a principal

    const temp = imagenesEditando.url1;
    imagenesEditando.url1 = imagenesEditando[key];
    imagenesEditando[key] = temp;

    imagenesReordenadas = true;
    refrescarPreviewsImagenes();
}


function resetNewImagePreviews() {

    ['1', '2', '3'].forEach(number => {
        const preview = document.getElementById(`new-image-preview-${number}`);

        if (preview) {
            preview.innerHTML = '';
            preview.classList.add('hidden');
        }
    });
}


// CAMBIO: igual que handleFilePreview, la validación ahora delega en
// validarImagenParaSubir() (magic bytes, no MIME). Mismo mensaje
// accionable, misma cobertura para HEIC con file.type vacío.
async function previewEditImage(input, previewId) {

    const file = input?.files?.[0];
    const preview = document.getElementById(previewId);

    if (!preview) return;

    if (!file) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        return;
    }

    const validacion = await validarImagenParaSubir(file, MAX_RAW_FILE_SIZE);

    if (!validacion.ok) {
        input.value = '';
        preview.innerHTML = '';
        preview.classList.add('hidden');
        showAlert(validacion.mensaje, 'error', 'modal');
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {
        preview.innerHTML = `
            <span>Nueva imagen</span>
            <img src="${event.target.result}" alt="Vista previa de nueva imagen">
        `;
        preview.classList.remove('hidden');
    };

    reader.readAsDataURL(file);
}


function closeEditModal() {

    const modal = document.getElementById('edit-modal');

    if (!modal) return;

    modal.classList.remove('is-open');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    document.getElementById('edit-modal-alert')?.classList.add('hidden');

    editingEjemplarId = null;

    const form = document.getElementById('edit-ejemplar-form');
    form?.reset();

    resetNewImagePreviews();
}


function setupEditModalListeners() {

    const form = document.getElementById('edit-ejemplar-form');
    const btnCancelar = document.getElementById('btn-cancelar-edit');
    const btnCloseX = document.getElementById('btn-close-modal-x');
    const editModal = document.getElementById('edit-modal');

    if (!form || !editModal) return;

    form.addEventListener('submit', handleEditSubmit);
    btnCancelar?.addEventListener('click', closeEditModal);
    btnCloseX?.addEventListener('click', closeEditModal);

    editModal.addEventListener('click', event => {
        if (event.target === editModal) closeEditModal();
    });

    ['1', '2', '3'].forEach(num => {
        document.getElementById(`edit-imagen-${num}`)?.addEventListener('change', event => {
            previewEditImage(event.target, `new-image-preview-${num}`);
        });
    });

    document.getElementById('btn-hacer-principal-2')?.addEventListener('click', () => hacerImagenPrincipal(2));
    document.getElementById('btn-hacer-principal-3')?.addEventListener('click', () => hacerImagenPrincipal(3));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && editModal.classList.contains('is-open')) {
            closeEditModal();
        }
    });
}


async function handleEditSubmit(event) {

    event.preventDefault();

    const id = editingEjemplarId || document.getElementById('edit-id')?.value.trim();

    if (!id) {
        showAlert('No se encontró el ID del ejemplar que deseas editar.', 'error', 'modal');
        return;
    }

    const especieIdVal = document.getElementById('edit-especie_id')?.value;
    const genetica = document.getElementById('edit-genetica')?.value.trim() || 'Nominal';
    const sexo = document.getElementById('edit-sexo')?.value || 'No sexado';
    const etapa = document.getElementById('edit-etapa')?.value || 'Cría';
    const nacimientoValue = document.getElementById('edit-nacimiento')?.value.trim();
    const longitudValue = document.getElementById('edit-longitud')?.value;
    const pesoValue = document.getElementById('edit-peso_gramos')?.value;
    const precioValue = document.getElementById('edit-precio')?.value.trim();
    const estatus = document.getElementById('edit-estatus')?.value || 'Disponible';
    const visiblePublico = document.getElementById('edit-visible_publico')?.checked ?? true;
    const notas = document.getElementById('edit-notas')?.value.trim() || null;

    if (!especieIdVal) {
        showAlert('Selecciona una especie.', 'error', 'modal');
        return;
    }

    const especieObj = especiesCache.find(e => String(e.id) === String(especieIdVal));
    const especie = especieObj?.nombre || '';

    const nacimiento = nacimientoValue ? parseInt(nacimientoValue, 10) : null;
    const precio = precioValue === '' ? 0 : parseFloat(precioValue);
    const longitud = longitudValue ? parseFloat(longitudValue) : null;
    const pesoGramos = pesoValue ? parseFloat(pesoValue) : null;

    const btnActualizar = document.getElementById('btn-actualizar');

    if (btnActualizar) {
        btnActualizar.disabled = true;
        btnActualizar.innerHTML = 'Guardando...';
    }

    const data = {
        especie,
        especie_id: Number(especieIdVal),
        genetica,
        sexo,
        etapa,
        nacimiento,
        longitud,
        peso_gramos: pesoGramos,
        precio,
        estatus,
        visible_publico: visiblePublico,
        notas
    };

    // Si se usó "Hacer principal" para reordenar las imágenes ya
    // guardadas (sin subir ningún archivo nuevo), hay que mandar las
    // 3 URLs explícitamente -- si no, Supabase no se entera del
    // cambio porque `data` normalmente solo toca imagen_url* cuando
    // updateEjemplar() detecta un archivo nuevo en nuevasImagenes.
    if (imagenesReordenadas) {
        data.imagen_url = imagenesEditando.url1;
        data.imagen_url_2 = imagenesEditando.url2;
        data.imagen_url_3 = imagenesEditando.url3;
    }

    const nuevasImagenes = {
        imagen1: document.getElementById('edit-imagen-1')?.files?.[0] || null,
        imagen2: document.getElementById('edit-imagen-2')?.files?.[0] || null,
        imagen3: document.getElementById('edit-imagen-3')?.files?.[0] || null
    };

    try {
        await updateEjemplar(id, data, nuevasImagenes);

        showAlert(`Ejemplar ${id} actualizado correctamente.`, 'success', 'modal');
        await loadDashboardData();
        setTimeout(() => closeEditModal(), 1200);

    } catch (error) {
        console.error('Error al actualizar ejemplar:', error);
        showAlert(friendlyErrorMessage(error, { entidad: 'ejemplar' }), 'error', 'modal');

    } finally {
        if (btnActualizar) {
            btnActualizar.disabled = false;
            btnActualizar.innerHTML = 'Guardar cambios';
        }
    }
}


async function updateEjemplar(ejemplarId, data, nuevasImagenes) {

    if (nuevasImagenes.imagen1) {
        data.imagen_url = await uploadImage(nuevasImagenes.imagen1, ejemplarId);
    }

    if (nuevasImagenes.imagen2) {
        data.imagen_url_2 = await uploadImage(nuevasImagenes.imagen2, ejemplarId);
    }

    if (nuevasImagenes.imagen3) {
        data.imagen_url_3 = await uploadImage(nuevasImagenes.imagen3, ejemplarId);
    }

    const { error } = await supabase
        .from('ejemplares')
        .update(data)
        .eq('id', ejemplarId);

    if (error) throw error;

    return true;
}


// ==========================================
// AGREGAR EJEMPLAR
// ==========================================

async function handleAddEjemplar(event) {

    event.preventDefault();

    if (!miCriadorId) {
        showAlert('No se pudo confirmar tu cuenta todavía. Espera un momento e intenta de nuevo.', 'error');
        return;
    }

    showAlert('Guardando ejemplar...', 'info');

    const btnSave = document.getElementById('btn-save');
    const addForm = document.getElementById('add-ejemplar-form');

    if (btnSave) btnSave.disabled = true;

    let idVal;

    try {
        idVal = document.getElementById('id')?.value.trim();
        const especieIdVal = document.getElementById('especie_id')?.value;
        const geneticaVal = document.getElementById('genetica')?.value.trim() || 'Nominal';
        const sexoVal = document.getElementById('sexo')?.value || 'No sexado';
        const etapaVal = document.getElementById('etapa')?.value || 'Cría';
        const nacimientoRaw = document.getElementById('nacimiento')?.value;
        const longitudRaw = document.getElementById('longitud')?.value;
        const pesoRaw = document.getElementById('peso_gramos')?.value;
        const precioRaw = document.getElementById('precio')?.value;
        const estatusVal = document.getElementById('estatus')?.value || 'Disponible';
        const visiblePublicoVal = document.getElementById('visible_publico')?.checked ?? true;
        const notasVal = document.getElementById('notas')?.value.trim() || null;

        const file1 = document.getElementById('imagen1')?.files[0];
        const file2 = document.getElementById('imagen2')?.files[0];
        const file3 = document.getElementById('imagen3')?.files[0];

        if (!idVal) {
            throw new Error('El ID / Código del ejemplar es obligatorio (ej. CR-16).');
        }

        if (!especieIdVal) {
            throw new Error('Selecciona una especie. Si no aparece ninguna, agrégala primero en "Especies registradas".');
        }

        // La columna "especie" (texto) se mantiene sincronizada automáticamente
        // a partir del catálogo de especies, para no romper el catálogo público
        // ni el Dashboard mientras se actualizan para leer la relación directa.
        const especieObj = especiesCache.find(e => String(e.id) === String(especieIdVal));
        const especieVal = especieObj?.nombre || '';

        if (!file1) {
            throw new Error('La imagen 1 (principal) es obligatoria.');
        }

        const nacimientoVal = parseInt(nacimientoRaw, 10);
        if (isNaN(nacimientoVal)) {
            throw new Error('Ingresa un año de nacimiento válido (ej. 2026).');
        }

        const precioValNum = parseFloat(precioRaw);
        if (isNaN(precioValNum) || precioValNum < 0) {
            throw new Error('Ingresa un precio válido (ej. 5000).');
        }

        const longitudVal = longitudRaw ? parseFloat(longitudRaw) : null;
        const pesoVal = pesoRaw ? parseFloat(pesoRaw) : null;

        const url1 = await uploadImage(file1, idVal);
        const url2 = file2 ? await uploadImage(file2, idVal) : null;
        const url3 = file3 ? await uploadImage(file3, idVal) : null;

        const nuevoEjemplar = {
            id: idVal,
            criador_id: miCriadorId,
            especie: especieVal,
            especie_id: Number(especieIdVal),
            genetica: geneticaVal,
            sexo: sexoVal,
            etapa: etapaVal,
            nacimiento: nacimientoVal,
            longitud: longitudVal,
            peso_gramos: pesoVal,
            precio: precioValNum,
            estatus: estatusVal,
            visible_publico: visiblePublicoVal,
            notas: notasVal,
            imagen_url: url1,
            imagen_url_2: url2,
            imagen_url_3: url3
        };

        const { error } = await supabase
            .from('ejemplares')
            .insert([nuevoEjemplar]);

        if (error) {
            throw Object.assign(
                new Error(error.message || 'Error al insertar en la base de datos'),
                { code: error.code, details: error.details }
            );
        }

        showAlert('¡Ejemplar registrado exitosamente!', 'success');

        addForm?.reset();
        resetPreviews();
        await loadDashboardData();

    } catch (err) {
        console.error('Error al agregar ejemplar:', err);
        showAlert(friendlyErrorMessage(err, { entidad: 'ejemplar', idIntentado: idVal }), 'error');

    } finally {
        if (btnSave) btnSave.disabled = false;
    }
}


function resetPreviews() {

    ['1', '2', '3'].forEach(id => {
        const preview = document.getElementById(`preview-${id}`);
        const zone = document.getElementById(`drop-zone-${id}`);

        if (preview && zone) {
            preview.classList.add('hidden');
            preview.innerHTML = '';
            zone.style.display = 'flex';
        }
    });
}


// ==========================================
// ELIMINAR EJEMPLAR
// ==========================================

async function deleteEjemplar(id, especie) {

    const ok = await confirmDialog(`¿Eliminar el ejemplar ${id} (${especie})?`, { textoConfirmar: 'Eliminar' });
    if (!ok) {
        return;
    }

    showAlert('Eliminando...', 'info');

    const { error } = await supabase
        .from('ejemplares')
        .delete()
        .eq('id', id);

    if (error) {
        showAlert(friendlyErrorMessage(error, { entidad: 'ejemplar' }), 'error');
    } else {
        showAlert('Ejemplar eliminado correctamente.', 'success');
        loadDashboardData();
    }
}


// ==========================================
// LIBERAR IMÁGENES (conserva el registro de venta, libera almacenamiento)
// ==========================================
//
// A diferencia de "Eliminar ejemplar" (que borra TODO, incluyendo el
// historial para las métricas del Dashboard), esta acción solo borra
// los archivos de imagen y deja en null las 3 columnas de imagen. La
// fila sigue existiendo con precio, especie, fecha, etc. intactos --
// pensada para ejemplares "Vendido" donde ya no se necesita conservar
// la foto, solo el dato de la venta.
//
// CAMBIO (migración a R2): las imágenes subidas ANTES de mover el
// almacenamiento a Cloudflare R2 siguen viviendo en Supabase Storage;
// las subidas DESPUÉS viven en R2. Esta función reconoce de cuál de
// los dos storages es cada URL y la borra del lugar correcto -- así
// que sigue funcionando para ejemplares con fotos "viejas" sin migrar
// nada a mano.

const R2_PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL;

function clasificarUrlImagen(url) {

    if (!url) return null;

    // Las URLs públicas de Supabase Storage tienen la forma:
    // https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
    const marcadorSupabase = '/object/public/ejemplares/';
    const indexSupabase = url.indexOf(marcadorSupabase);
    if (indexSupabase !== -1) {
        return { storage: 'supabase', path: url.substring(indexSupabase + marcadorSupabase.length) };
    }

    if (R2_PUBLIC_BASE_URL && url.startsWith(R2_PUBLIC_BASE_URL)) {
        return { storage: 'r2', path: url.substring(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, '') };
    }

    return null;
}

async function borrarDeR2(paths) {
    if (!UPLOAD_WORKER_URL || paths.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
        await fetch(UPLOAD_WORKER_URL, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paths })
        });
    } catch (networkError) {
        console.warn('No se pudieron borrar todos los archivos de R2:', networkError);
    }
}

async function liberarImagenes(ejemplar) {

    const ok = await confirmDialog(
        `¿Liberar las imágenes del ejemplar ${ejemplar.id}? El registro de la venta se conserva, solo se borran las fotos.`,
        { textoConfirmar: 'Liberar' }
    );
    if (!ok) {
        return;
    }

    showAlert('Liberando imágenes...', 'info');

    const clasificadas = [ejemplar.imagen_url, ejemplar.imagen_url_2, ejemplar.imagen_url_3]
        .map(clasificarUrlImagen)
        .filter(Boolean);

    const pathsSupabase = clasificadas.filter(c => c.storage === 'supabase').map(c => c.path);
    const pathsR2 = clasificadas.filter(c => c.storage === 'r2').map(c => c.path);

    try {
        if (pathsSupabase.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('ejemplares')
                .remove(pathsSupabase);

            if (storageError) {
                console.warn('No se pudieron borrar todos los archivos de Storage:', storageError);
            }
        }

        if (pathsR2.length > 0) {
            await borrarDeR2(pathsR2);
        }

        const { error } = await supabase
            .from('ejemplares')
            .update({ imagen_url: null, imagen_url_2: null, imagen_url_3: null })
            .eq('id', ejemplar.id);

        if (error) throw error;

        showAlert(`Imágenes de ${ejemplar.id} liberadas. El registro de venta se conservó.`, 'success');
        await loadDashboardData();

    } catch (error) {
        console.error('Error al liberar imágenes:', error);
        showAlert(friendlyErrorMessage(error, { entidad: 'ejemplar' }), 'error');
    }
}


// ==========================================
// CARGA DEL DASHBOARD
// ==========================================

async function loadDashboardData() {

    await Promise.all([
        loadFullInventory(),
        populateYearFilter(),
        loadEspecies()
    ]);

    // Se cargan y aplican DESPUÉS del Promise.all de arriba a propósito:
    // "especie_id" y "año" necesitan que sus <select> ya tengan las
    // opciones pobladas (loadEspecies / populateYearFilter) para que
    // asignarles un valor guardado realmente seleccione algo.
    cargarVistasGuardadas();
    poblarSelectVistas();

    const vistaPredeterminada = vistasGuardadas.find(v => v.esPredeterminada);
    if (vistaPredeterminada) {
        aplicarVista(vistaPredeterminada);
    }
}


// ==========================================
// INVENTARIO COMPLETO Y DESPLEGABLE
// ==========================================

function leerFiltrosActuales() {
    return {
        especie_id: document.getElementById('filter-especie_id')?.value || '',
        etapa: document.getElementById('filter-etapa')?.value || '',
        estatus: document.getElementById('filter-estatus')?.value || '',
        genetica: document.getElementById('filter-genetica')?.value.trim() || '',
        sexo: document.getElementById('filter-sexo')?.value || '',
        anio: document.getElementById('filter-anio')?.value || ''
    };
}

async function loadFullInventory(filtros = {}) {

    const fullTableBody = document.getElementById('full-inventory-table-body');

    if (!fullTableBody) return;

    fullTableBody.innerHTML = `
        <tr>
            <td colspan="11" style="text-align: center;">
                Cargando inventario...
            </td>
        </tr>
    `;

    try {
        let query = supabase.from('ejemplares').select('*');

        if (filtros.especie_id) query = query.eq('especie_id', filtros.especie_id);
        if (filtros.etapa) query = query.eq('etapa', filtros.etapa);
        if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
        if (filtros.genetica) query = query.ilike('genetica', `%${filtros.genetica}%`);
        if (filtros.sexo) query = query.eq('sexo', filtros.sexo);
        if (filtros.anio) query = query.eq('nacimiento', parseInt(filtros.anio, 10));

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        currentFilteredData = data || [];
        renderInventoryTable();

    } catch (err) {
        console.error('Error al filtrar inventario:', err);

        fullTableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; color: red;">
                    Error al consultar inventario: ${err.message}
                </td>
            </tr>
        `;
    }
}


function renderInventoryTable() {

    const fullTableBody = document.getElementById('full-inventory-table-body');
    const btnToggleInventory = document.getElementById('btn-toggle-inventory');
    const searchResultsCount = document.getElementById('search-results-count');

    if (!fullTableBody) return;

    const datosVisibles = filtrarPorBusqueda(currentFilteredData);
    const totalItems = datosVisibles.length;

    if (searchResultsCount) {
        searchResultsCount.textContent = searchQuery
            ? `${totalItems} de ${currentFilteredData.length}`
            : '';
    }

    if (btnToggleInventory) {
        if (totalItems <= 5) {
            btnToggleInventory.disabled = true;
            btnToggleInventory.textContent = 'Ver todos';
        } else {
            btnToggleInventory.disabled = false;
            btnToggleInventory.textContent = showingAll ? 'Mostrar menos' : 'Ver todos';
        }
    }

    const dataToRender = showingAll ? datosVisibles : datosVisibles.slice(0, 5);
    renderTableRows(dataToRender, fullTableBody);
}


// ==========================================
// BÚSQUEDA UNIFICADA
// ==========================================
//
// Un solo campo que busca en ID, especie (ya resuelta), genética,
// sexo, etapa, estatus y notas al mismo tiempo -- sobre los datos que
// ya trajo la consulta de los filtros de arriba, sin golpear Supabase
// otra vez por cada letra escrita. Si se escriben varias palabras
// ("hembra albino disponible"), se exige que TODAS aparezcan en algún
// campo del ejemplar, sin importar el orden.

function construirBlobBusqueda(item) {
    return [
        item.id,
        resolverEspecieNombre(item),
        item.genetica,
        item.sexo,
        item.etapa,
        item.estatus,
        item.notas
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function filtrarPorBusqueda(data) {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data;

    const tokens = query.split(/\s+/);

    return data.filter(item => {
        const blob = construirBlobBusqueda(item);
        return tokens.every(token => blob.includes(token));
    });
}

function debounce(fn, delayMs) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delayMs);
    };
}

function setupSearchListener() {
    const inputBusqueda = document.getElementById('filter-busqueda');

    inputBusqueda?.addEventListener('input', debounce(event => {
        searchQuery = event.target.value;
        showingAll = false;
        renderInventoryTable();
    }, 150));
}


// ==========================================
// VISTAS GUARDADAS
// ==========================================
//
// Combinaciones de filtros + búsqueda con nombre, guardadas en
// localStorage (son una preferencia de este navegador, no un dato del
// negocio -- por eso no viven en Supabase). Una de ellas puede
// marcarse "predeterminada" y se aplica sola al entrar a Control.

function cargarVistasGuardadas() {
    try {
        const raw = localStorage.getItem(VISTAS_STORAGE_KEY);
        vistasGuardadas = raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('Error al leer vistas guardadas:', err);
        vistasGuardadas = [];
    }
}

function persistirVistasGuardadas() {
    localStorage.setItem(VISTAS_STORAGE_KEY, JSON.stringify(vistasGuardadas));
}

function poblarSelectVistas() {
    const select = document.getElementById('saved-views-select');
    if (!select) return;

    const opciones = vistasGuardadas
        .map(v => `<option value="${escapeHTML(v.id)}">${escapeHTML(v.nombre)}${v.esPredeterminada ? ' ★' : ''}</option>`)
        .join('');

    select.innerHTML = `<option value="">— Selecciona una vista —</option>${opciones}`;
}

function aplicarVista(vista) {
    if (!vista) return;

    const { filtros, busqueda } = vista;

    const setValor = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.value = valor || '';
    };

    setValor('filter-especie_id', filtros.especie_id);
    setValor('filter-etapa', filtros.etapa);
    setValor('filter-estatus', filtros.estatus);
    setValor('filter-genetica', filtros.genetica);
    setValor('filter-sexo', filtros.sexo);
    setValor('filter-anio', filtros.anio);
    setValor('filter-busqueda', busqueda);

    searchQuery = busqueda || '';
    showingAll = false;

    const select = document.getElementById('saved-views-select');
    if (select) select.value = vista.id;

    const btnDeleteView = document.getElementById('btn-delete-view');
    if (btnDeleteView) btnDeleteView.disabled = false;

    loadFullInventory(filtros);
}

function setupSavedViewsListeners() {
    const select = document.getElementById('saved-views-select');
    const btnSaveView = document.getElementById('btn-save-view');
    const btnDeleteView = document.getElementById('btn-delete-view');
    const inputNombre = document.getElementById('saved-view-name');
    const checkPredeterminada = document.getElementById('saved-view-default');

    select?.addEventListener('change', () => {
        const vista = vistasGuardadas.find(v => v.id === select.value);

        if (btnDeleteView) btnDeleteView.disabled = !vista;

        if (vista) aplicarVista(vista);
    });

    btnSaveView?.addEventListener('click', () => {
        const nombre = inputNombre?.value.trim();

        if (!nombre) {
            showAlert('Ponle un nombre a la vista antes de guardarla.', 'error');
            return;
        }

        const esPredeterminada = !!checkPredeterminada?.checked;

        if (esPredeterminada) {
            vistasGuardadas.forEach(v => { v.esPredeterminada = false; });
        }

        // Si ya existe una vista con el mismo nombre, se sobreescribe en
        // vez de crear un duplicado -- es lo que la mayoría esperaría.
        const existente = vistasGuardadas.find(v => v.nombre.toLowerCase() === nombre.toLowerCase());

        const nuevaVista = {
            id: existente ? existente.id : `vista-${Date.now()}`,
            nombre,
            esPredeterminada,
            filtros: leerFiltrosActuales(),
            busqueda: searchQuery
        };

        if (existente) {
            Object.assign(existente, nuevaVista);
        } else {
            vistasGuardadas.push(nuevaVista);
        }

        persistirVistasGuardadas();
        poblarSelectVistas();

        if (select) select.value = nuevaVista.id;
        if (btnDeleteView) btnDeleteView.disabled = false;
        if (inputNombre) inputNombre.value = '';
        if (checkPredeterminada) checkPredeterminada.checked = false;

        showAlert(`Vista "${nombre}" guardada.`, 'success');
    });

    btnDeleteView?.addEventListener('click', async () => {
        const vista = vistasGuardadas.find(v => v.id === select?.value);
        if (!vista) return;

        const confirmado = await confirmDialog(
            `¿Eliminar la vista "${vista.nombre}"? Esto no afecta tu inventario, solo el atajo guardado.`,
            { textoConfirmar: 'Eliminar' }
        );
        if (!confirmado) return;

        vistasGuardadas = vistasGuardadas.filter(v => v.id !== vista.id);
        persistirVistasGuardadas();
        poblarSelectVistas();

        if (select) select.value = '';
        btnDeleteView.disabled = true;

        showAlert(`Vista "${vista.nombre}" eliminada.`, 'info');
    });
}


// ==========================================
// COLUMNAS CONFIGURABLES
// ==========================================
//
// Qué columnas de la tabla de inventario se muestran, guardado en
// localStorage (por eso es "ocultas" y no "visibles": así, si mañana
// se agrega una columna nueva a COLUMNAS_CONFIG, aparece visible por
// default para todos sin tener que migrar nada).

function obtenerColumnasOcultas() {
    try {
        const raw = localStorage.getItem(COLUMNAS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('Error al leer columnas ocultas:', err);
        return [];
    }
}

function guardarColumnasOcultas(ocultas) {
    localStorage.setItem(COLUMNAS_STORAGE_KEY, JSON.stringify(ocultas));
}

function aplicarColumnasVisibles() {
    const ocultas = obtenerColumnasOcultas();

    COLUMNAS_CONFIG.forEach(col => {
        const visible = !ocultas.includes(col.key);
        document.querySelectorAll(`[data-col="${col.key}"]`).forEach(el => {
            el.style.display = visible ? '' : 'none';
        });
    });
}

function renderColumnasPanel() {
    const container = document.getElementById('columnas-panel-checkboxes');
    if (!container) return;

    const ocultas = obtenerColumnasOcultas();

    container.innerHTML = COLUMNAS_CONFIG.map(col => `
        <label class="columna-check">
            <input type="checkbox" data-columna-key="${col.key}" ${ocultas.includes(col.key) ? '' : 'checked'}>
            ${escapeHTML(col.label)}
        </label>
    `).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const key = checkbox.getAttribute('data-columna-key');
            let ocultasActuales = obtenerColumnasOcultas();

            if (checkbox.checked) {
                ocultasActuales = ocultasActuales.filter(k => k !== key);
            } else if (!ocultasActuales.includes(key)) {
                ocultasActuales.push(key);
            }

            guardarColumnasOcultas(ocultasActuales);
            aplicarColumnasVisibles();
        });
    });
}

function setupColumnConfigListeners() {
    const btnToggle = document.getElementById('btn-toggle-columnas');
    const panel = document.getElementById('columnas-panel');

    if (!btnToggle || !panel) return;

    renderColumnasPanel();
    aplicarColumnasVisibles();

    btnToggle.addEventListener('click', event => {
        event.stopPropagation();
        panel.classList.toggle('hidden');
    });

    document.addEventListener('click', event => {
        if (!panel.contains(event.target) && event.target !== btnToggle) {
            panel.classList.add('hidden');
        }
    });
}


// ==========================================
// FILTRO DE AÑOS
// ==========================================

async function populateYearFilter() {

    const filterAnioSelect = document.getElementById('filter-anio');

    if (!filterAnioSelect) return;

    try {
        const { data, error } = await supabase
            .from('ejemplares')
            .select('nacimiento');

        if (error) throw error;

        const years = [
            ...new Set(
                data
                    .map(i => i.nacimiento)
                    .filter(Boolean)
            )
        ].sort((a, b) => b - a);

        let optionsHtml = `<option value="">Todos los años</option>`;

        years.forEach(year => {
            optionsHtml += `<option value="${year}">${year}</option>`;
        });

        filterAnioSelect.innerHTML = optionsHtml;

    } catch (err) {
        console.error('Error al cargar filtro de años:', err);
    }
}


// ==========================================
// RENDERIZAR TABLAS
// ==========================================

function renderTableRows(ejemplares, targetTbody) {

    if (!ejemplares || ejemplares.length === 0) {
        targetTbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center;">
                    No se encontraron registros.
                </td>
            </tr>
        `;
        return;
    }

    targetTbody.innerHTML = ejemplares
        .map(item => {
            const precioFormatted = new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: 'MXN'
            }).format(Number(item.precio) || 0);

            const estatus = item.estatus || 'Disponible';
            const estatusClass = estatus.toLowerCase().replace(/\s+/g, '-');
            const nombreEspecie = resolverEspecieNombre(item);

            return `
                <tr>
                    <td data-col="id"><strong>${escapeHTML(item.id)}</strong></td>
                    <td data-col="imagen">
                        <img
                            src="${safeImageUrl(item.imagen_url)}"
                            class="table-thumb"
                            alt="${escapeHTML(nombreEspecie)}"
                            loading="lazy"
                        >
                    </td>
                    <td data-col="especie">
                        <strong>${escapeHTML(nombreEspecie)}</strong>
                    </td>
                    <td data-col="genetica">${escapeHTML(item.genetica || 'Nominal')}</td>
                    <td data-col="sexo">${escapeHTML(item.sexo || 'No sexado')}</td>
                    <td data-col="etapa">${escapeHTML(item.etapa || '—')}</td>
                    <td data-col="anio">${escapeHTML(item.nacimiento || 'N/A')}</td>
                    <td data-col="precio" style="font-weight: 700; color: var(--primary-color);">
                        ${precioFormatted}
                    </td>
                    <td data-col="estatus">
                        <span class="status-badge status-${escapeHTML(estatusClass)}">
                            ${escapeHTML(estatus)}
                        </span>
                    </td>
                    <td data-col="publico">
                        ${item.visible_publico === false
                            ? '<span class="status-badge status-holdback">Oculto</span>'
                            : '<span class="status-badge status-disponible">Visible</span>'}
                    </td>
                    <td data-col="acciones">
                        <div class="action-buttons">
                            <button
                                type="button"
                                class="btn-icon btn-edit-icon"
                                title="Editar ejemplar"
                                data-id="${escapeHTML(item.id)}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>

                            ${estatus === 'Vendido' && (item.imagen_url || item.imagen_url_2 || item.imagen_url_3) ? `
                            <button
                                type="button"
                                class="btn-icon btn-liberar-icon"
                                title="Liberar imágenes (libera espacio, conserva el registro de venta)"
                                data-id="${escapeHTML(item.id)}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <path d="M21 15l-5-5L5 21"/>
                                </svg>
                            </button>
                            ` : ''}

                            <button
                                type="button"
                                class="btn-icon btn-delete-icon"
                                title="Eliminar ejemplar"
                                data-id="${escapeHTML(item.id)}"
                                data-especie="${escapeHTML(nombreEspecie)}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    aplicarColumnasVisibles();

    targetTbody.querySelectorAll('.btn-edit-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const id = event.currentTarget.getAttribute('data-id');
            const item = ejemplares.find(e => String(e.id).trim() === String(id).trim());
            if (item) openEditModal(item);
        });
    });

    targetTbody.querySelectorAll('.btn-liberar-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const id = event.currentTarget.getAttribute('data-id');
            const item = ejemplares.find(e => String(e.id).trim() === String(id).trim());
            if (item) liberarImagenes(item);
        });
    });

    targetTbody.querySelectorAll('.btn-delete-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const button = event.currentTarget;
            deleteEjemplar(button.getAttribute('data-id'), button.getAttribute('data-especie'));
        });
    });

    // CAMBIO (fila coloreada al hacer clic): togglea .row-selected sobre
    // el <tr> en el que se hizo clic -- el color real (rosa tenue,
    // mezclado con --primary-color del cliente) vive en admin.css. Los
    // botones de acción (editar/liberar/eliminar) ya llaman
    // event.stopPropagation() en sus propios listeners de arriba, así
    // que un clic en esos íconos NO llega hasta aquí y no selecciona la
    // fila por accidente -- solo un clic en el resto de la fila la
    // colorea. No se excluyen otras filas entre sí a propósito: se
    // pueden marcar varias filas sueltas a la vez (por ejemplo, para
    // tenerlas ubicadas visualmente mientras se revisan una por una),
    // igual que resaltar con un marcador sobre una tabla en papel.
    targetTbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
            tr.classList.toggle('row-selected');
        });
    });
}


// ==========================================
// ALERTAS DE ESTADO
// ==========================================

// Traduce errores técnicos (sobre todo códigos de error de Postgres)
// a un mensaje que el criador pueda entender sin saber qué es una
// "unique constraint" o un "foreign key". El detalle técnico completo
// siempre se manda a console.error por separado para depurar.
//
// opts.entidad: nombre en español de lo que se intentaba guardar
//   (ej. 'ejemplar', 'especie') para armar la frase.
// opts.idIntentado: el ID/código que el usuario intentó usar, si aplica.
function friendlyErrorMessage(error, opts = {}) {

    const entidad = opts.entidad || 'registro';
    const code = error?.code;

    // Sin código de Postgres: es un mensaje de validación que ya
    // escribimos nosotros mismos en español (ej. "El ID es
    // obligatorio"), así que se muestra tal cual.
    if (!code) {
        return error?.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
    }

    console.error(`Detalle técnico (código ${code}):`, error.message, error.details || '');

    switch (code) {
        case '23505': // unique_violation
            return opts.idIntentado
                ? `Ya existe un ${entidad} con el código "${opts.idIntentado}". Usa uno diferente.`
                : `Ya existe un ${entidad} con ese mismo dato. Revisa que no esté duplicado.`;

        case '23503': // foreign_key_violation
            return `No se puede completar esta acción: este ${entidad} está vinculado a otro registro existente.`;

        case '23502': // not_null_violation
            return 'Falta llenar un campo obligatorio. Revisa el formulario e intenta de nuevo.';

        default:
            return `No se pudo completar la acción. Intenta de nuevo (código ${code}).`;
    }
}

// El toast (#status-alert) es fixed y flota sobre el header sticky.
// Esto fija --header-height al alto real del header para que el
// toast aparezca siempre DEBAJO del menú, sin taparlo ni bloquear
// los enlaces de Control/Dashboard/Cerrar sesión.
function syncHeaderHeightVar() {
    const header = document.querySelector('.header');
    if (header) {
        document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
}
syncHeaderHeightVar();
window.addEventListener('resize', syncHeaderHeightVar);

function showAlert(message, type = 'info', target = 'toast') {

    const alertId = target === 'modal' ? 'edit-modal-alert' : 'status-alert';
    const alertEl = document.getElementById(alertId);

    if (!alertEl) return;

    alertEl.className = `alert-premium alert-${type}`;
    alertEl.innerHTML = '';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    alertEl.appendChild(textSpan);

    // Botón para cerrar a mano -- antes, un error (que no se autooculta)
    // se quedaba pegado sin ninguna forma de quitarlo de encima.
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-premium-close';
    closeBtn.setAttribute('aria-label', 'Cerrar aviso');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => alertEl.classList.add('hidden'));
    alertEl.appendChild(closeBtn);

    alertEl.classList.remove('hidden');

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            alertEl.classList.add('hidden');
        }, 4000);
    }
}