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
 */

import { widgetManager } from '../widgetManager.js';

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
        
        // Hide toolbar if empty (can be populated by subclasses)
        if (this.toolbar.children.length === 0) {
            this.toolbar.style.display = 'none';
        }

        // Register with manager (it will handle initial positioning)
        // We pass the newly created element implicitly because widgetManager looks up by ID
        widgetManager.register(this.id, {
            preferredWidth: this.options.width,
            preferredHeight: this.options.height,
            side: this.options.side || 'left'
        });
    }

    /**
     * Show the widget with animation
     */
    show() {
        if (!this.element) this.create();
        
        this.element.classList.remove('hidden');
        this.isVisible = true;

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
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
