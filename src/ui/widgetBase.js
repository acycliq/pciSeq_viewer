/**
 * WidgetBase
 *
 * A base class for creating consistent, interactive floating widgets with a "Glass" aesthetic.
 * Handles common functionality:
 * - DOM creation/destruction
 * - Drag-and-drop
 * - Resizing
 * - Show/Hide animations
 * - State management
 * - Where it opens: a free spot in the map area the first time (widgetManager),
 *   and after that wherever the user left it, at the size they left it
 * - Stacking: the panel last clicked is on top
 */

import { widgetManager } from '../widgetManager.js';

const BASE_Z = 2000;      // the z-index of .glass-widget in styles.css
const stack = [];         // the panels, back to front

// where the user left a panel, kept in this browser between sessions
const layoutKey = id => `widgetLayout:${id}`;

function savedLayout(id) {
    try {
        const at = JSON.parse(localStorage.getItem(layoutKey(id)));
        const ok = at && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(at[k]));
        return ok ? at : null;
    } catch {
        return null;
    }
}

// offsetLeft and friends, not getBoundingClientRect: that one is a little off while
// the opening animation is still scaling the panel
function saveLayout(id, element) {
    const at = { x: element.offsetLeft, y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
    try {
        localStorage.setItem(layoutKey(id), JSON.stringify(at));
    } catch {}
}

export class WidgetBase {
    constructor(id, title, options = {}) {
        this.id = id;
        this.title = title;
        this.options = {
            width: 500,
            height: 400,
            minWidth: 300,
            minHeight: 250,
            ...options
        };

        this.element = null;
        this.isVisible = false;
        
        // Bind methods
        this.close = this.close.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onResizeStart = this.onResizeStart.bind(this);
    }

    /**
     * Create the widget DOM structure
     */
    create() {
        if (this.element) return;

        // Container
        this.element = document.createElement('div');
        this.element.id = this.id;
        this.element.className = 'glass-widget hidden';
        this.element.style.width = `${this.options.width}px`;
        this.element.style.height = `${this.options.height}px`;

        // Inner Structure
        this.element.innerHTML = `
            <div class="glass-widget-header">
                <span class="glass-widget-title">${this.title}</span>
                <div class="glass-widget-controls">
                    <button class="glass-control-btn close-btn" title="Close">×</button>
                </div>
            </div>
            <div class="glass-widget-toolbar"></div>
            <div class="glass-widget-content">
                <div class="glass-loader">Loading...</div>
            </div>
            <div class="glass-resize-handle"></div>
        `;

        document.body.appendChild(this.element);

        // Cache selectors
        this.header = this.element.querySelector('.glass-widget-header');
        this.contentContainer = this.element.querySelector('.glass-widget-content');
        this.toolbar = this.element.querySelector('.glass-widget-toolbar');
        this.closeBtn = this.element.querySelector('.close-btn');
        this.resizeHandle = this.element.querySelector('.glass-resize-handle');

        // Event Listeners
        this.closeBtn.addEventListener('click', this.close);
        this.header.addEventListener('mousedown', this.onMouseDown);
        this.resizeHandle.addEventListener('mousedown', this.onResizeStart);
        // a click anywhere on the panel brings it to the front
        this.element.addEventListener('mousedown', () => this.bringToFront(), true);
        
        // Hide toolbar if empty (can be populated by subclasses)
        if (this.toolbar.children.length === 0) {
            this.toolbar.style.display = 'none';
        }

    }

    /**
     * Show the widget with animation. Already open: bring it to the front and flash
     * it, so the eye finds it.
     */
    show() {
        if (!this.element) this.create();

        if (this.isVisible) {
            this.bringToFront();
            this.flash();
            if (this.onShow) this.onShow();
            return;
        }

        // the manager finds it a place, or puts it back where the user left it
        widgetManager.register(this.id, {
            preferredWidth: this.options.width,
            preferredHeight: this.options.height,
            at: savedLayout(this.id)
        });
        this.bringToFront();

        this.element.classList.remove('hidden');
        this.isVisible = true;
        this.announce();

        // Trigger reflow for animation
        requestAnimationFrame(() => {
            this.element.classList.add('visible');
        });

        // Optional hook for subclasses
        if (this.onShow) this.onShow();
    }

    /**
     * Hide the widget
     */
    hide() {
        if (!this.element) return;
        
        this.element.classList.remove('visible');
        this.isVisible = false;
        this.announce();

        // Wait for transition to finish before display: none
        setTimeout(() => {
            if (!this.isVisible) {
                this.element.classList.add('hidden');
            }
        }, 300);

        if (this.onHide) this.onHide();
    }

    close() {
        this.hide();
        // Notify manager
        widgetManager.unregister(this.id);
    }

    // put this panel on top of the others
    bringToFront() {
        const i = stack.indexOf(this);
        if (i === stack.length - 1 && i >= 0) return;
        if (i >= 0) stack.splice(i, 1);
        stack.push(this);
        stack.forEach((w, z) => { if (w.element) w.element.style.zIndex = BASE_Z + z; });
    }

    // a short glow round the panel
    flash() {
        this.element.classList.remove('attention');
        void this.element.offsetWidth;      // restart the animation
        this.element.classList.add('attention');
    }

    // tell whoever cares (the chart cards in the drawer) that it opened or closed
    announce() {
        window.dispatchEvent(new CustomEvent('widget-visibility', { detail: { id: this.id, visible: this.isVisible } }));
    }

    /**
     * Set content (HTML or Element)
     */
    setContent(content) {
        if (!this.element) this.create();
        this.contentContainer.innerHTML = '';
        if (typeof content === 'string') {
            this.contentContainer.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            this.contentContainer.appendChild(content);
        }
    }

    /**
     * Add a toolbar control (select, button, etc.)
     */
    addToolbarControl(element) {
        if (!this.element) this.create();
        this.toolbar.appendChild(element);
        this.toolbar.style.display = 'flex';
    }

    // === Drag Logic ===
    onMouseDown(e) {
        if (e.target.closest('button')) return; // Ignore buttons

        const startX = e.clientX;
        const startY = e.clientY;
        const rect = this.element.getBoundingClientRect();
        const startLeft = rect.left;
        const startTop = rect.top;

        const onMouseMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            
            // Constrain to viewport
            const newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, startLeft + dx));
            const newTop = Math.max(0, Math.min(window.innerHeight - rect.height, startTop + dy));

            this.element.style.left = `${newLeft}px`;
            this.element.style.top = `${newTop}px`;
            this.element.style.transform = 'none'; // Remove centering transforms if any
            
            // Update widget manager state
            widgetManager.reposition(this.id, newLeft, newTop);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveLayout(this.id, this.element);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // === Resize Logic ===
    onResizeStart(e) {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = this.element.offsetWidth;
        const startHeight = this.element.offsetHeight;

        const onMouseMove = (ev) => {
            requestAnimationFrame(() => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                const newWidth = Math.max(this.options.minWidth, startWidth + dx);
                const newHeight = Math.max(this.options.minHeight, startHeight + dy);

                this.element.style.width = `${newWidth}px`;
                this.element.style.height = `${newHeight}px`;

                // Notify subclass of resize
                if (this.onResize) this.onResize(newWidth, newHeight);
            });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveLayout(this.id, this.element);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
