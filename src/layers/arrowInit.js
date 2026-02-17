/**
 * Arrow Initialization Module
 * Handles lazy initialization of the Arrow worker facade
 */

import { ARROW_MANIFESTS } from '../../config/constants.js';

let arrowInitialized = false;

/**
 * Ensures the Arrow loader is initialized with the correct manifests.
 * This is a lazy singleton to avoid redundant initialization.
 */
export async function ensureArrowInitialized() {
    if (arrowInitialized) return;
    const { initArrow } = await import('../../arrow-loader/lib/arrow-loaders.js');
    initArrow({
        spotsManifest: ARROW_MANIFESTS.spotsManifest,
        cellsManifest: ARROW_MANIFESTS.cellsManifest,
        boundariesManifest: ARROW_MANIFESTS.boundariesManifest
    });
    arrowInitialized = true;
}
