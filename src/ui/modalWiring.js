// About and Keyboard Shortcuts modal wiring.
// Moved out of an inline index.html script so the CSP can block inline scripts.

(function() {
    const btn = document.getElementById('aboutBtn');
    const modalBg = document.getElementById('aboutModal');
    const closeBtn = document.getElementById('aboutClose');

    if (!btn || !modalBg) return;

    const open = () => modalBg.classList.add('active');
    const close = () => modalBg.classList.remove('active');

    btn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    modalBg.addEventListener('click', (e) => { if (e.target === modalBg) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

// Keyboard Shortcuts modal wiring
(function() {
    const modalBg = document.getElementById('shortcutsModal');
    const closeBtn = document.getElementById('shortcutsClose');
    if (!modalBg) return;

    const open = () => modalBg.classList.add('active');
    const close = () => modalBg.classList.remove('active');

    if (closeBtn) closeBtn.addEventListener('click', close);
    modalBg.addEventListener('click', (e) => { if (e.target === modalBg) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (e.key === '/' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); open(); }
    });

    // Electron IPC trigger
    if (window.electronAPI && window.electronAPI.onShowShortcuts) {
        window.electronAPI.onShowShortcuts(() => open());
    }
})();
