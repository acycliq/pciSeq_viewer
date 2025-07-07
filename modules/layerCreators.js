/**
 * Layer Creation Module
 * 
 * This module contains functions that create different types of deck.gl layers
 * for visualizing tiles, polygons, and gene expression data
 */

import { 
    IMG_DIMENSIONS, 
    MAX_TILE_CACHE, 
    GENE_SIZE_CONFIG,
    getTileUrlPattern 
} from '../config/constants.js';
import { 
    clamp, 
    transformToTileCoordinates 
} from '../utils/coordinateTransform.js';
import { loadImage } from './dataLoaders.js';

// Extract deck.gl components for layer creation
const {DeckGL, OrthographicView, COORDINATE_SYSTEM, TileLayer, BitmapLayer, GeoJsonLayer, IconLayer} = deck;

/**
 * Create a tile layer for background image display
 * Handles tile loading, caching, and rendering with opacity control
 * @param {number} planeNum - Plane number for tile source
 * @param {number} opacity - Layer opacity (0-1)
 * @param {Map} tileCache - Cache for loaded tiles
 * @param {boolean} showTiles - Whether tiles should be visible
 * @returns {TileLayer} Configured tile layer
 */
export function createTileLayer(planeNum, opacity, tileCache, showTiles) {
    return new TileLayer({
        id: `tiles-${planeNum}`,
        pickable: false, // Tiles don't need mouse interaction
        tileSize: IMG_DIMENSIONS.tileSize,
        minZoom: 0,
        maxZoom: 8,
        opacity: opacity,
        visible: showTiles,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extent: [0, 0, IMG_DIMENSIONS.width, IMG_DIMENSIONS.height],
        
        // Async tile data loading with caching
        getTileData: async ({index}) => {
            const {x, y, z} = index;
            const cacheKey = `${planeNum}-${z}-${y}-${x}`;

            // Return cached tile if available (instant return!)
            if (tileCache.has(cacheKey)) {
                const cachedData = tileCache.get(cacheKey);
                // If it's already resolved data, return immediately
                if (cachedData && typeof cachedData.then !== 'function') {
                    return cachedData;
                }
                // If it's still a promise, await it
                return await cachedData;
            }

            // Load new tile using configured URL pattern
            const urlPattern = getTileUrlPattern();
            const imageUrl = urlPattern
                .replace('{plane}', planeNum)
                .replace('{z}', z)
                .replace('{y}', y)
                .replace('{x}', x);
            
            // Check if we should show tile errors
            const userConfig = window.config ? window.config() : { showTileErrors: false };
            const suppressErrors = !userConfig.showTileErrors;
            
            const promise = loadImage(imageUrl, suppressErrors)
                .then(imageData => {
                    // Cache the resolved image data, not the promise
                    tileCache.set(cacheKey, imageData);
                    return imageData;
                })
                .catch(error => {
                    // Only log error if not suppressed
                    if (!error.suppressLogging) {
                        console.error('Error loading tile:', error);
                    }
                    // Cache null for failed loads to avoid repeated requests
                    tileCache.set(cacheKey, null);
                    return null;
                });

            // Initially cache the promise while loading
            tileCache.set(cacheKey, promise);

            // Clean cache if it gets too large (LRU-style cleanup)
            if (tileCache.size > MAX_TILE_CACHE) {
                const keys = Array.from(tileCache.keys());
                for (let i = 0; i < Math.floor(MAX_TILE_CACHE / 4); i++) {
                    tileCache.delete(keys[i]);
                }
            }

            return promise;
        },
        
        // Render individual tile as bitmap
        renderSubLayers: (props) => {
            if (!props.data) return null;

            const {left, bottom, right, top} = props.tile.bbox;
            const {width, height} = IMG_DIMENSIONS;

            return new BitmapLayer({
                ...props,
                id: `${props.id}-bitmap`,
                data: null,
                image: props.data,
                bounds: [
                    clamp(left, 0, width),
                    clamp(bottom, 0, height),
                    clamp(right, 0, width),
                    clamp(top, 0, height)
                ]
            });
        }
    });
}

/**
 * Create polygon layers for cell boundary visualization
 * Groups polygons by alias and creates separate layers for each group
 * @param {number} planeNum - Current plane number
 * @param {Map} polygonCache - Cache containing polygon data
 * @param {boolean} showPolygons - Whether polygons should be visible
 * @param {Map} polygonAliasVisibility - Visibility state for each alias
 * @param {Map} polygonAliasColors - Color mapping for each alias
 * @returns {GeoJsonLayer[]} Array of polygon layers
 */
export function createPolygonLayers(planeNum, polygonCache, showPolygons, polygonAliasVisibility, polygonAliasColors) {
    const layers = [];
    console.log(`createPolygonLayers called for plane ${planeNum}, showPolygons: ${showPolygons}`);
    
    if (!showPolygons) {
        console.log('Polygons disabled in state');
        return layers;
    }

    const geojson = polygonCache.get(planeNum);
    if (!geojson) {
        console.log(`No polygon data for plane ${planeNum}`);
        return layers;
    }
    
    console.log(`Creating polygon layers for plane ${planeNum}, features: ${geojson.features.length}`);

    // Group features by alias for separate layer rendering
    const groupedFeatures = new Map();
    geojson.features.forEach(feature => {
        const alias = feature.properties.alias;
        if (!groupedFeatures.has(alias)) {
            groupedFeatures.set(alias, []);
        }
        groupedFeatures.get(alias).push(feature);
    });

    // Create a separate layer for each visible alias group
    groupedFeatures.forEach((features, alias) => {
        if (polygonAliasVisibility.get(alias)) {
            const color = polygonAliasColors.get(alias);
            const aliasGeojson = {
                type: 'FeatureCollection',
                features: features
            };

            const layer = new GeoJsonLayer({
                id: `polygons-${planeNum}-${alias}`,
                data: aliasGeojson,
                pickable: true, // Enable mouse interactions for tooltips
                stroked: false, // No polygon outlines by default
                filled: true,   // Show filled polygons
                getFillColor: [...color, 120], // Semi-transparent fill
                coordinateSystem: COORDINATE_SYSTEM.CARTESIAN
            });

            layers.push(layer);
        }
    });

    return layers;
}

/**
 * Create gene expression layers
 * Creates icon layers for each gene with dynamic sizing based on plane distance
 * @param {Map} geneDataMap - Map of gene data by gene name
 * @param {boolean} showGenes - Whether genes should be visible
 * @param {Set} selectedGenes - Set of currently visible genes
 * @param {HTMLCanvasElement} geneIconAtlas - Icon atlas canvas
 * @param {Object} geneIconMapping - Icon coordinate mapping
 * @param {number} currentPlane - Current plane number for depth sizing
 * @param {number} geneSizeScale - Global size multiplier
 * @param {Function} showTooltip - Tooltip callback function
 * @returns {IconLayer[]} Array of gene icon layers
 */
export function createGeneLayers(geneDataMap, showGenes, selectedGenes, geneIconAtlas, geneIconMapping, currentPlane, geneSizeScale, showTooltip) {
    const layers = [];
    if (!showGenes || !geneIconAtlas) return layers;

    // Create a separate layer for each gene for individual visibility control
    for (const gene of geneDataMap.keys()) {
        const layer = new IconLayer({
            id: `genes-${gene}`,
            data: geneDataMap.get(gene),
            visible: selectedGenes.has(gene),
            pickable: true, // Enable mouse interactions
            onHover: showTooltip,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            iconAtlas: geneIconAtlas,
            iconMapping: geneIconMapping,
            
            // Transform gene coordinates to match tile coordinate system
            getPosition: d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS),
            
            // Dynamic sizing based on distance from current plane (depth effect)
            getSize: d => GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.z - currentPlane)),
            
            getIcon: d => d.gene,
            getColor: [255, 255, 255], // White color for gene markers
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            
            // Trigger layer update when plane changes (for size recalculation)
            updateTriggers: {
                getSize: [currentPlane]
            }
        });

        layers.push(layer);
    }

    return layers;
}