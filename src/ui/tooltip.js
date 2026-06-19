/**
 * App Tooltip
 *
 * One styled tooltip bubble shared by the whole app, replacing the browser's
 * native `title="..."` boxes with a clean dark pill (Gemini style).
 *
 * How it works (no per-element setup, no markup changes needed):
 *   - A single `.app-tooltip` element is appended to <body>.
 *   - Hover is handled by delegation on `document`, so it also covers elements
 *     created later at runtime (gene rows, cell-class eyes, region rows, ...).
 *   - When an element with a native `title` is first hovered, we "adopt" it:
 *     copy the text to `data-tooltip`, mirror it to `aria-label` (so screen
 *     readers keep the label), then remove `title` so the native box never shows.
 *   - The bubble is placed next to the element and flips at the viewport edges
 *     so it never clips.
 *
 * Wiring:
 *   - initTooltips() is called once at startup (src/app.js).
 *   - Any element with a `title` or `data-tooltip` attribute gets the bubble.
 */

const GAP = 8;            // distance between element and bubble (px)
const SHOW_DELAY = 250;   // ms before the bubble appears

let bubble = null;
let showTimer = null;
let currentTarget = null;

// Find the nearest ancestor (or self) that carries tooltip text.
function findTarget(node) {
    let el = node;
    while (el && el !== document.body) {
        if (el.dataset && (el.dataset.tooltip || el.hasAttribute('title'))) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
}

// Move a native `title` onto `data-tooltip` so the native box never appears,
// keeping the label available to screen readers via `aria-label`.
function adoptTitle(el) {
    if (el.hasAttribute('title')) {
        const text = el.getAttribute('title');
        el.dataset.tooltip = text;
        if (!el.hasAttribute('aria-label')) {
            el.setAttribute('aria-label', text);
        }
        el.removeAttribute('title');
    }
    return el.dataset.tooltip || '';
}

// Position the bubble next to the element, flipping to stay on screen.
function position(el) {
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();

    // Prefer the right side (suits the left-rail icons); flip left if it would clip.
    let left = r.right + GAP;
    if (left + b.width > window.innerWidth) {
        left = r.left - GAP - b.width;
    }

    // Vertically centre on the element, clamped to the viewport.
    let top = r.top + (r.height - b.height) / 2;
    top = Math.max(GAP, Math.min(top, window.innerHeight - b.height - GAP));

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
}

function show(el) {
    const text = adoptTitle(el);
    if (!text) return;
    bubble.textContent = text;
    bubble.classList.add('visible');
    position(el);
}

function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    currentTarget = null;
    if (bubble) bubble.classList.remove('visible');
}

function onPointerOver(e) {
    const el = findTarget(e.target);
    if (!el || el === currentTarget) return;
    currentTarget = el;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(el), SHOW_DELAY);
}

function onPointerOut(e) {
    const el = findTarget(e.target);
    if (el && el === currentTarget) hide();
}

export function initTooltips() {
    if (bubble) return; // already initialised

    bubble = document.createElement('div');
    bubble.className = 'app-tooltip';
    document.body.appendChild(bubble);

    document.addEventListener('mouseover', onPointerOver);
    document.addEventListener('mouseout', onPointerOut);
    document.addEventListener('focusin', onPointerOver);
    document.addEventListener('focusout', onPointerOut);

    // Hide on anything that should dismiss it.
    document.addEventListener('click', hide, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hide();
    });
}
