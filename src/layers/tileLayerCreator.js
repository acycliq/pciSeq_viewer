/**
 * Tile Layer Creator
 * Handles background image tile rendering with LRU caching
 */

import {
    IMG_DIMENSIONS,
    MAX_TILE_CACHE,
    getTileUrlPattern
} from '../../config/constants.js';
import { clamp } from '../../utils/coordinateTransform.js';
import { loadImage } from '../data/dataLoaders.js';

const { COORDINATE_SYSTEM, TileLayer, BitmapLayer } = deck;

/**
 * Create a tile layer for background image display
 * Handles tile loading, caching, and rendering with opacity control
 */
export function createTileLayer(planeNum, opacity, tileCache, showTiles) {
    return new TileLayer({
        id: `tiles-${planeNum}`,
        pickable: false,
        tileSize: IMG_DIMENSIONS.tileSize,
        minZoom: 0,
        maxZoom: 8,
        opacity: opacity,
        visible: showTiles,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extent: [0, 0, IMG_DIMENSIONS.width, IMG_DIMENSIONS.height],

        getTileData: async ({index}) => {
            const {x, y, z} = index;
            const cacheKey = `${planeNum}-${z}-${y}-${x}`;

            if (tileCache.has(cacheKey)) {
                const cachedData = tileCache.get(cacheKey);
                if (cachedData && typeof cachedData.then !== 'function') {
                    return cachedData;
                }
                return await cachedData;
            }

            const urlPattern = getTileUrlPattern();
            const imageUrl = urlPattern
                .replace('{plane}', planeNum)
                .replace('{z}', z)
                .replace('{y}', y)
                .replace('{x}', x);

            const advancedConfig = window.advancedConfig ? window.advancedConfig() : { performance: { showTileErrors: false } };
            const suppressErrors = !advancedConfig.performance.showTileErrors;

            const promise = loadImage(imageUrl, suppressErrors)
                .then(imageData => {
                    tileCache.set(cacheKey, imageData);
                    return imageData;
                })
                .catch(error => {
                    if (!error.suppressLogging) {
                        console.error('Error loading tile:', error);
                    }
                    tileCache.set(cacheKey, null);
                    return null;
                });

            tileCache.set(cacheKey, promise);

            if (tileCache.size > MAX_TILE_CACHE) {
                const keys = Array.from(tileCache.keys());
                for (let i = 0; i < Math.floor(MAX_TILE_CACHE / 4); i++) {
                    tileCache.delete(keys[i]);
                }
            }

            return promise;
        },

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
