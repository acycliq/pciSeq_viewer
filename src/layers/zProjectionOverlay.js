/**
 * Z-Projection Plane Overlay System (Arrow-only)
 *
 * Renders cell boundaries from all planes into a single overlay texture
 * for instant 3D spatial context visualization. Uses Arrow boundaries only.
 */

const { BitmapLayer } = window.deck;
import { IMG_DIMENSIONS } from '../../config/constants.js';
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';

let globalZProjectionTexture = null;
let isBuilding = false;
let buildPromise = null;

export async function buildGlobalZProjection(appState, progressCallback = null) {
  if (globalZProjectionTexture) return globalZProjectionTexture;
  if (isBuilding) return buildPromise;
  isBuilding = true;
  try {
    buildPromise = _buildZProjectionTexture(appState, progressCallback);
    globalZProjectionTexture = await buildPromise;
    return globalZProjectionTexture;
  } finally {
    isBuilding = false;
    buildPromise = null;
  }
}

async function _buildZProjectionTexture(appState, progressCallback) {
  const { width: imageWidth, height: imageHeight } = IMG_DIMENSIONS;
  const canvas = new OffscreenCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, imageWidth, imageHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 0.5;

  const totalPlanes = window.appState.totalPlanes;
  const planesToProcess = Array.from({ length: totalPlanes }, (_, i) => i);

  for (let idx = 0; idx < planesToProcess.length; idx++) {
    const planeNum = planesToProcess[idx];
    try {
      const boundaries = await getBoundariesForPlane(planeNum, appState);
      if (boundaries && boundaries.features) {
        for (const feature of boundaries.features) {
          if (feature.geometry && feature.geometry.coordinates) {
            renderFeatureToCanvas(ctx, feature);
          }
        }
      }
      if (progressCallback && (idx + 1) % 10 === 0) {
        progressCallback({ planesProcessed: idx + 1, totalPlanes });
      }
    } catch {}
  }

  return canvas.transferToImageBitmap();
}

async function getBoundariesForPlane(planeNum, appState) {
  if (appState && appState.polygonCache && appState.polygonCache.has(planeNum)) {
    return appState.polygonCache.get(planeNum);
  }
  return await loadArrowBoundaries(planeNum);
}

async function loadArrowBoundaries(planeNum) {
  try {
    const { loadBoundariesPlane } = await import('../../arrow-loader/lib/arrow-loaders.js');
    const { buffers } = await loadBoundariesPlane(planeNum);
    if (!buffers || !buffers.positions || !buffers.startIndices) return null;
    return convertArrowToGeoJSON(buffers, planeNum);
  } catch (e) {
    return null;
  }
}

function convertArrowToGeoJSON(buffers, planeNum) {
  const { positions, startIndices, length, labels } = buffers;
  const features = [];
  for (let pi = 0; pi < length; pi++) {
    const start = startIndices[pi];
    const end = startIndices[pi + 1];
    if (end - start < 3) continue;
    const coordinates = [];
    for (let i = start; i < end; i++) {
      const x = positions[2 * i];
      const y = positions[2 * i + 1];
      const [tx, ty] = transformToTileCoordinates(x, y, IMG_DIMENSIONS);
      coordinates.push([tx, ty]);
    }
    // ensure closed ring
    if (coordinates.length > 2) {
      const [fx, fy] = coordinates[0];
      const [lx, ly] = coordinates[coordinates.length - 1];
      if (fx !== lx || fy !== ly) coordinates.push([fx, fy]);
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: { plane_id: planeNum, label: labels ? labels[pi] : -1 }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function renderFeatureToCanvas(ctx, feature) {
  if (!feature?.geometry || feature.geometry.type !== 'Polygon') return;
  const coordinates = feature.geometry.coordinates?.[0] || [];
  if (coordinates.length < 3) return;
  const { width: imageWidth, height: imageHeight, tileSize } = IMG_DIMENSIONS;
  const maxDimension = Math.max(imageWidth, imageHeight);
  const scaleX = imageWidth / (tileSize * imageWidth / maxDimension);
  const scaleY = imageHeight / (tileSize * imageHeight / maxDimension);
  ctx.beginPath();
  const firstX = coordinates[0][0] * scaleX;
  const firstY = imageHeight - (coordinates[0][1] * scaleY);
  ctx.moveTo(firstX, firstY);
  for (let i = 1; i < coordinates.length; i++) {
    const x = coordinates[i][0] * scaleX;
    const y = imageHeight - (coordinates[i][1] * scaleY);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

export function createZProjectionLayer(visible = false, opacity = 0.3) {
  if (!globalZProjectionTexture) return null;
  const { width: imageWidth, height: imageHeight, tileSize } = IMG_DIMENSIONS;
  const maxDimension = Math.max(imageWidth, imageHeight);
  const tileWidth = tileSize * (imageWidth / maxDimension);
  const tileHeight = tileSize * (imageHeight / maxDimension);
  return new BitmapLayer({
    id: 'z-projection-overlay',
    image: globalZProjectionTexture,
    bounds: [0, 0, tileWidth, tileHeight],
    opacity, visible,
    coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
    parameters: { blend: true, blendFunc: [770, 771], depthTest: false }
  });
}

export function isZProjectionReady() {
  return globalZProjectionTexture !== null;
}

export function clearZProjection() {
  if (globalZProjectionTexture) {
    globalZProjectionTexture.close();
    globalZProjectionTexture = null;
  }
}
