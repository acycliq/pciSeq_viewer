/**
 * Draw a region by hand. Press Draw in the Annotations section, then click on the
 * map to drop points. Click the first point again, or press Enter, to close the
 * outline; Backspace takes the last point back, Esc stops. Dragging still pans the
 * map, only a click without moving drops a point.
 *
 * The points are kept in image pixels, the same as the region CSVs, and drawn on
 * an SVG over the map that follows every pan and zoom while you draw.
 */
import { transformToTileCoordinates, transformFromTileCoordinates } from '../../utils/coordinateTransform.js';
import { IMG_DIMENSIONS } from '../../config/constants.js';

const CLICK_SLOP = 4;     // px the mouse may move and still count as a click
const CLOSE_RADIUS = 10;  // px around the first point where a click closes the outline
const COLOUR = '#ffffff';

const isTyping = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

export class RegionDrawer {
    /**
     * deck: the map's deck.gl instance
     * onDone(points): called with the closed outline, in image pixels
     * onActiveChange(active): so the Draw button can show the mode
     */
    constructor(deck, { onDone, onActiveChange }) {
        this.deck = deck;
        this.onDone = onDone;
        this.onActiveChange = onActiveChange;
        this.isActive = false;
        this.points = [];
        this.mouse = null;
        this.downAt = null;
        this.svg = null;
        this.frame = null;
        this.container = document.getElementById('map');

        this.container.addEventListener('pointerdown', e => this.onPointerDown(e));
        this.container.addEventListener('pointermove', e => { this.mouse = this.local(e); });
        this.container.addEventListener('pointerup', e => this.onPointerUp(e));
        document.addEventListener('keydown', e => this.onKeyDown(e));
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.points = [];
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:1000;';
        this.container.appendChild(this.svg);
        const loop = () => { this.render(); this.frame = requestAnimationFrame(loop); };
        loop();
        this.onActiveChange?.(true);
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        this.points = [];
        cancelAnimationFrame(this.frame);
        this.svg?.remove();
        this.svg = null;
        this.onActiveChange?.(false);
    }

    toggle() {
        if (this.isActive) this.stop(); else this.start();
    }

    // ------------------------------------------------------------------ input

    local(e) {
        const r = this.container.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }

    onPointerDown(e) {
        this.downAt = this.isActive && e.button === 0 && !(e.ctrlKey || e.metaKey) ? this.local(e) : null;
    }

    onPointerUp(e) {
        if (!this.isActive || !this.downAt) return;
        const at = this.local(e);
        const moved = Math.hypot(at[0] - this.downAt[0], at[1] - this.downAt[1]);
        this.downAt = null;
        if (moved > CLICK_SLOP) return;          // that was a pan
        if (this.points.length >= 3 && this.nearFirst(at)) this.finish();
        else this.points.push(this.toImage(at));
    }

    onKeyDown(e) {
        if (!this.isActive || isTyping(e)) return;
        if (e.key === 'Escape') this.stop();
        else if (e.key === 'Enter' && this.points.length >= 3) this.finish();
        else if (e.key === 'Backspace') { this.points.pop(); e.preventDefault(); }
    }

    finish() {
        const points = this.points;
        this.stop();
        this.onDone(points);
    }

    // ------------------------------------------------------------------ coordinates

    viewport() {
        return this.deck.getViewports()[0];
    }

    toImage(screen) {
        const [tx, ty] = this.viewport().unproject(screen);
        return transformFromTileCoordinates(tx, ty, IMG_DIMENSIONS).map(v => Math.round(v * 10) / 10);
    }

    toScreen([x, y]) {
        return this.viewport().project(transformToTileCoordinates(x, y, IMG_DIMENSIONS));
    }

    nearFirst(screen) {
        const [fx, fy] = this.toScreen(this.points[0]);
        return Math.hypot(screen[0] - fx, screen[1] - fy) <= CLOSE_RADIUS;
    }

    // ------------------------------------------------------------------ drawing

    // every frame while drawing, so the outline follows the map as it pans and zooms
    render() {
        if (!this.svg) return;
        const pts = this.points.map(p => this.toScreen(p));
        const line = this.mouse && pts.length ? [...pts, this.mouse] : pts;
        const closable = pts.length >= 3 && this.mouse && this.nearFirst(this.mouse);
        const dots = pts.map(([x, y], i) =>
            `<circle cx="${x}" cy="${y}" r="${i === 0 && closable ? 7 : 3}" fill="${COLOUR}"/>`).join('');
        this.svg.innerHTML =
            `<polyline points="${line.map(p => p.join(',')).join(' ')}" fill="none" stroke="${COLOUR}" ` +
            'stroke-width="2" stroke-dasharray="6 4"/>' + dots;
    }
}
