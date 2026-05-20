/**
 * Canvas Rectangle Selector
 *
 * Modal-style overlay that lets the user drag a rectangle on the deck.gl canvas,
 * Ubuntu-screenshot style. Resolves with the rectangle in CANVAS PIXEL coords
 * (the same coordinate system canvas.toBlob / drawImage source-rect use), or
 * null if the user cancels with Escape.
 *
 * External wiring:
 *   - The caller passes in the deck.gl canvas element and a container (usually
 *     document.body) that the overlay can be appended to.
 *   - The function is single-use: it creates the overlay, listens for one drag,
 *     cleans up, and resolves. Call it again to pick another rectangle.
 */

/**
 * Show a rectangle picker over the given canvas.
 *
 * @param {Object}             args
 * @param {HTMLCanvasElement}  args.canvas      The deck.gl canvas.
 * @param {HTMLElement}        [args.container] Element to append the overlay to. Defaults to document.body.
 * @returns {Promise<{x:number, y:number, width:number, height:number} | null>}
 */
export function selectCanvasRectangle({ canvas, container = document.body }) {
    return new Promise(resolve => {
        const overlay = buildOverlay(canvas);
        const box = overlay.querySelector('.canvas-rect-box');
        container.appendChild(overlay);

        let dragging = false;
        let startX = 0;
        let startY = 0;

        function cleanup() {
            overlay.remove();
            window.removeEventListener('keydown', onKey);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        }

        overlay.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = overlay.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            box.style.left = `${startX}px`;
            box.style.top = `${startY}px`;
            box.style.width = '0px';
            box.style.height = '0px';
            box.style.display = 'block';
            dragging = true;
        });

        overlay.addEventListener('mousemove', e => {
            if (!dragging) return;
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            box.style.left = `${Math.min(startX, x)}px`;
            box.style.top = `${Math.min(startY, y)}px`;
            box.style.width = `${Math.abs(x - startX)}px`;
            box.style.height = `${Math.abs(y - startY)}px`;
        });

        overlay.addEventListener('mouseup', e => {
            if (!dragging) return;
            dragging = false;

            const rect = overlay.getBoundingClientRect();
            const endX = e.clientX - rect.left;
            const endY = e.clientY - rect.top;

            const cssX = Math.min(startX, endX);
            const cssY = Math.min(startY, endY);
            const cssW = Math.abs(endX - startX);
            const cssH = Math.abs(endY - startY);

            cleanup();

            if (cssW < 5 || cssH < 5) {
                resolve(null);
                return;
            }

            resolve(cssRectToCanvasPixels(canvas, cssX, cssY, cssW, cssH));
        });

        window.addEventListener('keydown', onKey);
    });
}

/**
 * Build the crosshair overlay element. The overlay sits directly over the
 * canvas's screen rectangle so mouse coords translate cleanly.
 */
function buildOverlay(canvas) {
    const rect = canvas.getBoundingClientRect();

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '99999',
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.08)',
        userSelect: 'none'
    });

    const box = document.createElement('div');
    box.className = 'canvas-rect-box';
    Object.assign(box.style, {
        position: 'absolute',
        border: '2px dashed #ffffff',
        background: 'rgba(255, 255, 255, 0.12)',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)',
        pointerEvents: 'none',
        display: 'none'
    });
    overlay.appendChild(box);

    const hint = document.createElement('div');
    hint.textContent = 'Drag a rectangle around the area to export. Press Esc to cancel.';
    Object.assign(hint.style, {
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        padding: '6px 12px',
        fontSize: '12px',
        borderRadius: '4px',
        pointerEvents: 'none',
        fontFamily: 'inherit'
    });
    overlay.appendChild(hint);

    return overlay;
}

/**
 * Translate a CSS-pixel rectangle (relative to the canvas's screen position)
 * into the canvas's backing-buffer pixel coordinate space. This is the
 * coordinate system canvas.toBlob / drawImage's source-rect expect.
 *
 * The result is clamped to the canvas bounds.
 */
function cssRectToCanvasPixels(canvas, cssX, cssY, cssW, cssH) {
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const x = Math.max(0, Math.round(cssX * scaleX));
    const y = Math.max(0, Math.round(cssY * scaleY));
    const width = Math.min(canvas.width - x, Math.round(cssW * scaleX));
    const height = Math.min(canvas.height - y, Math.round(cssH * scaleY));

    return { x, y, width, height };
}