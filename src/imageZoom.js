/**
 * Shows one picture over the whole window, for the chat's pictures (cell_image,
 * plane_image, allen_gene_image): the mouse wheel zooms towards the pointer, a drag
 * pans, and Escape or a click on the dark background closes it. The picture is the
 * one already in the chat, so the zoom stops at its own resolution.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 12;

export function openImageZoom(src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-zoom';
    const img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    let scale = 1, x = 0, y = 0, drag = null, moved = false;
    const draw = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };

    // zoom towards the pointer: the point under it stays where it is
    overlay.addEventListener('wheel', e => {
        e.preventDefault();
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
        const r = img.getBoundingClientRect();
        const px = e.clientX - (r.left + r.width / 2), py = e.clientY - (r.top + r.height / 2);
        x -= px * (next / scale - 1);
        y -= py * (next / scale - 1);
        scale = next;
        if (scale === MIN_SCALE) { x = 0; y = 0; }
        draw();
    }, { passive: false });

    overlay.addEventListener('mousedown', e => { drag = { sx: e.clientX - x, sy: e.clientY - y }; moved = false; });
    overlay.addEventListener('mousemove', e => {
        if (!drag) return;
        x = e.clientX - drag.sx; y = e.clientY - drag.sy; moved = true;
        draw();
    });
    overlay.addEventListener('mouseup', () => { drag = null; });

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // a click on the background closes it, the end of a drag does not
    overlay.addEventListener('click', e => { if (e.target === overlay && !moved) close(); });
}
