// Prepares rho_bar data from diagnostics metadata.
// Returns [{gene, rho}] sorted by rho ascending.

export function prepareRhoData(meta) {
    const rhoBar = meta.get('rho_bar');
    if (!rhoBar || !Object.keys(rhoBar).length) return [];
    return Object.entries(rhoBar)
        .map(([gene, rho]) => ({ gene, rho }))
        .sort((a, b) => a.rho - b.rho);
}
