// Loads misread metadata (misread_density, gene_panel) from diagnostics.db via Electron IPC.
// Returns a Map of key → value, or empty Map if diagnostics are not loaded.

let _meta = null;

export async function loadDiagnosticsMeta() {
    if (_meta) return _meta;

    if (!window.electronAPI?.getMisreadMeta) return new Map();

    try {
        const result = await window.electronAPI.getMisreadMeta();
        if (!result?.enabled) return new Map();

        _meta = new Map(Object.entries(result));
        return _meta;
    } catch (e) {
        console.warn('[diagnosticsLoader] Could not load misread metadata:', e.message);
        return new Map();
    }
}

export function resetDiagnosticsCache() {
    _meta = null;
}