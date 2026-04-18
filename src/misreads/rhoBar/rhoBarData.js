// Prepares rho_bar data from diagnostics metadata.
// Falls back to misread_density (prior) when rho_bar is absent.
// Returns { data: [{gene, rho}], isPosterior: bool }

export function prepareRhoData(meta) {
    const rhoBar = meta.get('rho_bar');
    const isPosterior = rhoBar && Object.keys(rhoBar).length > 0;
    const source = isPosterior ? rhoBar : (meta.get('misread_density') || {});
    return {
        data: Object.entries(source).map(([gene, rho]) => ({ gene, rho })),
        isPosterior,
    };
}
