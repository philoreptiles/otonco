/**
 * src/utils/confirm-dialog.js
 * ---------------------------------------------------------------------
 * Reemplaza confirm()/window.confirm() -- el único punto donde el
 * panel de Admin se "sale" de su propio diseño para mostrar el diálogo
 * feo nativo del navegador -- por un modal propio, visualmente
 * consistente con .edit-modal-overlay/.edit-modal (mismo criterio:
 * fondo oscuro semitransparente + caja centrada con --jet-card).
 * No depende de ninguna librería.
 *
 * Devuelve una Promise<boolean> igual que confirm(), así que basta con
 * anteponer `await` donde antes había un `if (!confirm(...))`.
 *
 * Uso:
 *   import { confirmDialog } from '../../utils/confirm-dialog.js';
 *   const ok = await confirmDialog(`¿Eliminar el ejemplar ${id}?`, { textoConfirmar: 'Eliminar' });
 *   if (!ok) return;
 */
export function confirmDialog(mensaje, { textoConfirmar = 'Eliminar', textoCancelar = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');

        const box = document.createElement('div');
        box.className = 'confirm-box';

        const texto = document.createElement('p');
        texto.className = 'confirm-message';
        // textContent, no innerHTML -- el mensaje suele traer datos
        // que capturó el criador (especie, nombre de una vista
        // guardada, etc.), así que no hay que interpretarlos como HTML.
        texto.textContent = mensaje;

        const acciones = document.createElement('div');
        acciones.className = 'confirm-actions';

        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.className = 'btn-secondary-premium';
        btnCancelar.textContent = textoCancelar;

        const btnConfirmar = document.createElement('button');
        btnConfirmar.type = 'button';
        btnConfirmar.className = 'btn-confirm-ok';
        btnConfirmar.textContent = textoConfirmar;

        acciones.append(btnCancelar, btnConfirmar);
        box.append(texto, acciones);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Mismo patrón que .edit-modal-overlay: nace cerrado y se abre
        // en el siguiente frame para que la transición CSS tenga un
        // cambio real que animar (si se agrega ".is-open" en el mismo
        // ciclo en el que se inserta el elemento, el navegador nunca
        // "ve" el estado inicial y salta directo al final).
        requestAnimationFrame(() => overlay.classList.add('is-open'));

        const focoPrevio = document.activeElement;
        btnConfirmar.focus();

        const cerrar = (resultado) => {
            overlay.classList.remove('is-open');
            document.removeEventListener('keydown', onKeydown);
            setTimeout(() => overlay.remove(), 200);
            if (focoPrevio instanceof HTMLElement) focoPrevio.focus();
            resolve(resultado);
        };

        const onKeydown = (e) => {
            if (e.key === 'Escape') cerrar(false);
            if (e.key === 'Enter') cerrar(true);
        };

        btnConfirmar.addEventListener('click', () => cerrar(true));
        btnCancelar.addEventListener('click', () => cerrar(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cerrar(false);
        });
        document.addEventListener('keydown', onKeydown);
    });
}
