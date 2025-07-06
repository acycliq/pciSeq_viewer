/**
 * Data Loading Module
 * 
 * This module handles loading and processing of gene expression data and polygon
 * boundary data from various sources (TSV files, remote APIs, etc.)
 */

import { 
    GENE_DATA_URL, 
    IMG_DIMENSIONS, 
    POLYGON_ALIAS_THRESHOLDS,
    POLYGON_COLOR_PALETTE,
    getPolygonFileUrl 
} from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

/**
 * Load image with promise wrapper for error handling
 * @param {string} url - Image URL to load
 * @returns {Promise<HTMLImageElement>} Loaded image element
 */
export async function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

/**
 * Load and parse gene expression data from TSV file
 * Populates the gene data map and builds icon atlas
 * @param {Map} geneDataMap - Map to store gene data by gene name
 * @param {Set} selectedGenes - Set to track visible genes
 * @returns {Object} Icon atlas and mapping for gene visualization
 */
export async function loadGeneData(geneDataMap, selectedGenes) {
    if (geneDataMap.size > 0) return { atlas: null, mapping: null };

    try {
        // Fetch and parse TSV data
        const txt = await (await fetch(GENE_DATA_URL)).text();
        const data = d3.tsvParse(txt, d => ({
            x: +d.x,
            y: +d.y,
            z: +d.plane_id,
            gene: d.gene_name
        }));

        // Group gene spots by gene name for efficient rendering
        data.forEach(d => {
            if (!geneDataMap.has(d.gene)) {
                geneDataMap.set(d.gene, []);
            }
            geneDataMap.get(d.gene).push(d);
        });

        // Initially all genes are visible
        geneDataMap.forEach((spots, gene) => {
            selectedGenes.add(gene);
        });

        // Build icon atlas for gene visualization
        const genes = Array.from(geneDataMap.keys());
        const {atlas, mapping} = buildGeneIconAtlas(genes);
        
        return { atlas, mapping };

    } catch (err) {
        console.error('Failed to load gene data:', err);
        return { atlas: null, mapping: null };
    }
}

/**
 * Build icon atlas canvas for gene visualization
 * Creates a single canvas with all gene symbols for efficient rendering
 * @param {string[]} genes - Array of gene names
 * @returns {Object} Canvas atlas and coordinate mapping
 */
function buildGeneIconAtlas(genes) {
    const settings = glyphSettings();
    const configMap = new Map(settings.map(s => [s.gene, {glyphName: s.glyphName, color: s.color}]));
    const defaultConfig = configMap.get('Generic') || {glyphName: 'circle', color: '#ffffff'};

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size * genes.length;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const mapping = {};

    genes.forEach((gene, i) => {
        const cfg = configMap.get(gene) || defaultConfig;
        const p = {x: i * size + size/2, y: size/2};
        const r = size * 0.4;
        
        ctx.save();
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 4;
        ctxPath(cfg.glyphName, ctx, p, r);
        ctx.stroke();
        ctx.restore();
        
        mapping[gene] = {x: i * size, y: 0, width: size, height: size};
    });

    return {atlas: canvas, mapping};
}

/**
 * Generate polygon alias based on label for grouping and coloring
 * @param {string|number} label - Original polygon label
 * @returns {string} Generated alias (group_A, group_B, etc.)
 */
function generatePolygonAlias(label) {
    if (!label) return 'unknown';
    const labelStr = label.toString().toLowerCase();
    const numericPart = parseInt(labelStr.match(/\d+/)?.[0] || '0');

    if (numericPart < POLYGON_ALIAS_THRESHOLDS.GROUP_A_MAX) {
        return 'group_A';
    } else if (numericPart < POLYGON_ALIAS_THRESHOLDS.GROUP_B_MAX) {
        return 'group_B';
    } else if (numericPart < POLYGON_ALIAS_THRESHOLDS.GROUP_C_MAX) {
        return 'group_C';
    } else {
        return 'group_D';
    }
}

/**
 * Convert TSV polygon data to GeoJSON format
 * Transforms coordinates to tile space and assigns aliases
 * @param {Object[]} tsvData - Raw TSV data rows
 * @param {number} planeId - Current plane ID
 * @param {Set} allPolygonAliases - Set to track all discovered aliases
 * @returns {Object} GeoJSON FeatureCollection
 */
function tsvToGeoJSON(tsvData, planeId, allPolygonAliases) {
    const features = tsvData.flatMap(row => {
        if (!row || !row.coords) return [];

        try {
            const parsedCoords = JSON.parse(row.coords);
            if (!Array.isArray(parsedCoords) || parsedCoords.length < 3) return [];

            // Transform coordinates from image space to tile space (256x256)
            // This ensures polygons align with gene markers and background tiles
            const scaledCoords = parsedCoords.map(([x, y]) => 
                transformToTileCoordinates(x, y, IMG_DIMENSIONS)
            );

            const alias = generatePolygonAlias(row.label);
            allPolygonAliases.add(alias);

            return [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [scaledCoords]
                },
                properties: {
                    plane_id: planeId,
                    label: row.label,
                    alias: alias
                }
            }];
        } catch (e) {
            console.error(`Skipping polygon feature due to JSON parsing error`, e);
            return [];
        }
    });

    return { type: 'FeatureCollection', features: features };
}

/**
 * Load polygon boundary data for a specific plane
 * Handles caching, coordinate transformation, and alias generation
 * @param {number} planeNum - Plane number to load
 * @param {Map} polygonCache - Cache for polygon data
 * @param {Set} allPolygonAliases - Set to track all polygon aliases
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function loadPolygonData(planeNum, polygonCache, allPolygonAliases) {
    // Return cached data if available
    if (polygonCache.has(planeNum)) {
        const cachedData = polygonCache.get(planeNum);
        console.log(`Using cached polygon data for plane ${planeNum}, features: ${cachedData?.features?.length || 0}`);
        return cachedData;
    }

    try {
        console.log(`Loading polygon data for plane ${planeNum}`);
        
        // Load TSV data for the specific plane using configured path
        const polygonUrl = getPolygonFileUrl(planeNum);
        console.log(`Loading from: ${polygonUrl}`);
        const data = await d3.tsv(polygonUrl);
        console.log(`Loaded ${data.length} polygon rows for plane ${planeNum}`);
        
        // Convert to GeoJSON with coordinate transformation
        const geojson = tsvToGeoJSON(data, planeNum, allPolygonAliases);
        console.log(`Converted to ${geojson.features.length} GeoJSON features`);
        
        // Cache the result for future use
        polygonCache.set(planeNum, geojson);

        return geojson;
    } catch (err) {
        console.error(`Failed to load polygon data for plane ${planeNum}:`, err);
        console.error('Error details:', err.message, err.stack);
        
        // Return empty collection on error (don't cache failures)
        return { type: 'FeatureCollection', features: [] };
    }
}

/**
 * Assign colors to polygon aliases for consistent visualization
 * @param {Set} allPolygonAliases - All discovered aliases
 * @param {Map} polygonAliasColors - Map to store alias colors
 * @param {Map} polygonAliasVisibility - Map to store alias visibility
 */
export function assignColorsToPolygonAliases(allPolygonAliases, polygonAliasColors, polygonAliasVisibility) {
    const aliases = Array.from(allPolygonAliases);
    aliases.forEach((alias, index) => {
        if (!polygonAliasColors.has(alias)) {
            polygonAliasColors.set(alias, POLYGON_COLOR_PALETTE[index % POLYGON_COLOR_PALETTE.length]);
        }
        if (!polygonAliasVisibility.has(alias)) {
            polygonAliasVisibility.set(alias, true);
        }
    });
}