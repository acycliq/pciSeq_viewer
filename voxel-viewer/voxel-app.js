/**
 * Biological Data 3D Viewer Application
 * Main application logic for voxel-viewer.html
 */
import { buildPlaneLabelMask, buildMasksByPlane } from './core/masks.js';
import { generateVoxelsFromMasks } from './core/voxelizer.js';
import { buildSceneIndex } from './core/sceneIndex.js';
import { initGenesPanel } from './ui/genesPanel.js';
import { createLayers as buildLayers } from './layers/createLayers.js';
import { initControls } from './ui/controls.js';
import { initSliceSlider } from './ui/slider.js';
import { showTooltip as showChunkTooltip, hideTooltip as hideChunkTooltip } from './ui/tooltip.js';

// Boundary tracing no longer used; raster masks produce boundary voxels.

// Gene color mapping function using glyph configuration
function getGeneColor(geneName) {
    // Use glyph configuration if available
    if (typeof glyphSettings === 'function') {
        const settings = glyphSettings();
        const geneSetting = settings.find(s => s.gene === geneName);
        
        if (geneSetting && geneSetting.color) {
            // Convert hex color to RGB array
            const color = d3.rgb(geneSetting.color);
            return [color.r, color.g, color.b];
        }
    }
    
    // Try to get from parent window's glyph configuration
    if (window.opener && typeof window.opener.glyphSettings === 'function') {
        const settings = window.opener.glyphSettings();
        const geneSetting = settings.find(s => s.gene === geneName);
        
        if (geneSetting && geneSetting.color) {
            const color = d3.rgb(geneSetting.color);
            return [color.r, color.g, color.b];
        }
    }
    
    // Default color for unknown genes (blue)
    return [0, 0, 255];
}

// Data source selection function
function getDataset() {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    
    if (source === 'selection' && window.opener?.lastSelectionResults) {
        console.log('Using selection data from main viewer');
        console.log('Selection bounds:', window.opener.lastSelectionResults.bounds);
        console.log('Selection spots:', window.opener.lastSelectionResults.spots.count);
        console.log('Selection cells:', window.opener.lastSelectionResults.cells.count);
        return window.opener.lastSelectionResults;
    } else {
        console.log('🎮 Using demo test dataset');
        return generateTestDataset();
    }
}

// Tooltip now provided by ui/tooltip.js

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const {DeckGL, LightingEffect, AmbientLight, DirectionalLight, OrbitView} = deck;

    // Get dataset from selection or generate test data
    const dataset = getDataset();
    console.log('Generated dataset:', dataset);
    
    // Gene selection state (declare early so transformBioDataToBlocks can use them)
    let availableGenes = new Set(); // All genes in the current dataset
    let selectedGenes = new Set(); // Currently visible genes
    let geneColors = new Map(); // Gene -> color mapping
    
    // Print original spot coordinates
    console.log('=== ORIGINAL SPOT COORDINATES ===');
    dataset.spots.data.forEach((spot, i) => {
        if (i < 10) { // Print first 10 spots
            console.log(`Spot ${i}: gene=${spot.gene}, x=${spot.x.toFixed(1)}, y=${spot.y.toFixed(1)}, z=${spot.z.toFixed(1)}, plane=${spot.plane_id}`);
        }
    });
    console.log(`... and ${dataset.spots.data.length - 10} more spots`);
    console.log('=== END ORIGINAL COORDINATES ===');

    // Convert plane_id to anisotropic Y coordinate for rendering
    function planeIdToSliceY(planeId) {
        if (window.opener && window.opener.window.config) {
            const config = window.opener.window.config();
            const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
            return planeId * (zVoxel / xVoxel); // Anisotropic scaling for proper Z positioning
        }
        return planeId; // Direct mapping fallback
    }

    // Ray-cast removed: any usage should throw to surface incorrect code paths.
    function isPointInPolygon() { throw new Error('Ray-cast removed: use raster mask'); }
    function getCellAtPosition() { throw new Error('Ray-cast removed: use raster mask'); }


    // Transform biological data to minecraft-layer format
    async function transformBioDataToBlocks(dataset) {
        const geneVoxels = [];
        const stoneVoxels = []; // will represent the background
        const cellVoxels = []; // voxels inside cell boundaries
        const boundaryVoxels = []; // voxels for traced cell boundary lines
        
        // Center-aligned integer bounds so voxel centers lie strictly inside float bounds.
        // Derivation: We test at centers (i + 0.5). To ensure (i + 0.5) ≥ left_float, we need
        // i ≥ left_float - 0.5 ⇒ i_min = ceil(left_float - 0.5). Similarly, to ensure
        // (i + 0.5) ≤ right_float, we need i ≤ right_float - 0.5 ⇒ i_max = floor(right_float - 0.5).
        // Doing this for both axes guarantees the very first sampled center is inside the
        // true float rectangle. This avoids the classic bug where the "first" row/column of
        // centers (e.g., 0.5) is actually outside a top/left edge at 0.65/0.60, which would
        // wrongly create a solid stone face.
        const bounds = {
            left: Math.ceil(dataset.bounds.left - 0.5),
            right: Math.floor(dataset.bounds.right - 0.5),
            top: Math.ceil(dataset.bounds.top - 0.5),
            bottom: Math.floor(dataset.bounds.bottom - 0.5),
            depth: Math.floor(dataset.bounds.depth)
        };
        
        // Calculate selection dimensions, then add 1 to include the boundary pixels
        const selectionWidth = (bounds.right - bounds.left) + 1;   // +1 to include right boundary pixel
        const selectionHeight = (bounds.bottom - bounds.top) + 1;  // +1 to include bottom boundary pixel
        const selectionDepth = bounds.depth + 1;                   // +1 to include depth boundary
        console.log('Selection dimensions with boundary pixels:', {width: selectionWidth, height: selectionHeight, depth: selectionDepth});
        
        // Block dimensions = pixel dimensions (perfect 1:1 mapping)
        const maxX = selectionWidth;   // No Math.ceil() needed!
        const maxY = selectionDepth;   // No Math.ceil() needed!  
        const maxZ = selectionHeight;  // No Math.ceil() needed!
        
        // Scale factors eliminated - direct 1:1 integer mapping
        // scaleX, scaleY, scaleZ are now redundant and removed!

        console.log('Selection dimensions (integer pixels):', {width: selectionWidth, height: selectionHeight, depth: selectionDepth});
        console.log('Block dimensions (1:1 integer mapping):', {maxX, maxY, maxZ});
        console.log('Mapping: original[X,Y,Z] → viewer[X,Z,Y] with direct integer arithmetic');



        // Create background stone grid using plane-based positioning with cell boundary holes (via raster mask)
        console.log('🏗️ Creating stone blocks at plane positions with cell boundary holes (raster mask)...');
        const stoneStartTime = performance.now();
        
        let totalBlocks = 0;
        let holesCreated = 0;
        
        // Get plane count from config
        let totalPlanes = Math.floor(maxY / 2.5); // fallback estimate
        if (window.opener && window.opener.window.config) {
            const config = window.opener.window.config();
            totalPlanes = config.totalPlanes;
        }
        
        // Build scene indices (per-plane cells, id->color)
        const { cellsByPlane, colorById } = buildSceneIndex(dataset);

        // Build masks per plane and generate voxels disjointly (interior/boundary)
        const maskByPlane = buildMasksByPlane(cellsByPlane, bounds, totalPlanes);
        const vox = generateVoxelsFromMasks({
            maskByPlane,
            bounds,
            maxX,
            maxZ,
            totalPlanes,
            planeIdToSliceY,
            colorById
        });
        // Avoid spread on very large arrays to prevent call stack overflow
        for (const v of vox.stoneVoxels) stoneVoxels.push(v);
        for (const v of vox.cellVoxels) cellVoxels.push(v);
        
        const stoneEndTime = performance.now();
        console.log(`✅ Stone creation completed in ${(stoneEndTime - stoneStartTime).toFixed(1)}ms`);
        console.log(`📊 Performance: ${totalPlanes} planes, ${totalBlocks} blocks processed, ${stoneVoxels.length} stone blocks created`);
        console.log(`🕳️ Cell boundary holes: ${holesCreated} holes created (${((holesCreated/totalBlocks)*100).toFixed(1)}% of total blocks)`);
        console.log(`🧱 Hole stone blocks: ${cellVoxels.length} voxels inside cell boundaries`);
        
        // Debug: Show stone positions from different planes
        console.log('🏗️ Sample stone positions across different planes:');
        const planesToShow = [0, 1, 2, 3, 4, 5];
        planesToShow.forEach(targetPlane => {
            const stonesFromPlane = stoneVoxels.filter(stone => stone.planeId === targetPlane);
            if (stonesFromPlane.length > 0) {
                const stone = stonesFromPlane[0]; // Show first stone from this plane
                console.log(`  Plane ${targetPlane}: Y=${stone.position[1]}, sample stone pos=[${stone.position[0]}, ${stone.position[1]}, ${stone.position[2]}] (${stonesFromPlane.length} total stones)`);
            }
        });

        // Boundary voxels already created in generateVoxelsFromMasks
        const boundaryStartTime = performance.now();
        for (const v of vox.boundaryVoxels) boundaryVoxels.push(v);
        
        const boundaryEndTime = performance.now();
        console.log(`✅ Boundary tracing completed in ${(boundaryEndTime - boundaryStartTime).toFixed(1)}ms`);
        console.log(`🔴 Boundary voxels created: ${boundaryVoxels.length} voxels from ${dataset.cells.count} cells`);
        
        // Debug: Log cell IDs and their voxel counts
        const uniqueCellIds = [...new Set(boundaryVoxels.map(v => v.cellId))];
        console.log('🔍 Debug: Cell IDs in boundary voxels:', uniqueCellIds);
        uniqueCellIds.forEach(cellId => {
            const voxelCount = boundaryVoxels.filter(v => v.cellId === cellId).length;
            console.log(`  Cell ${cellId}: voxelType=3, voxelId=${cellId}, ${voxelCount} voxels`);
        });

        // Transform gene spots to colored blocks (with coordinate transpose)
        dataset.spots.data.forEach((spot, index) => {
            // Convert spot coordinates to integers by dropping decimals
            const spotX = Math.floor(spot.x);  // Clean integer pixels
            const spotY = Math.floor(spot.y);  // Clean integer pixels
            const spotZ = Math.floor(spot.z);  // Clean integer depth
            
            const x = spotX - bounds.left;            // Global → Local X (simple integer subtraction)
            const y = planeIdToSliceY(spot.plane_id); // plane_id → viewer Y (anisotropic scaling)  
            const z = spotY - bounds.top;             // Global → Local Y→Z (simple integer subtraction)
            
            // Debug: Log transformation for first few spots
            if (index < 5) {
                console.log(`🎯 Spot ${index}: plane_id=${spot.plane_id} → Y=${y}, original(${spotX}, ${spotY}, ${spotZ}) → viewer(${x}, ${y}, ${z})`);
            }

            // Get gene color from main viewer's glyph configuration
            const rgb = getGeneColor(spot.gene);

            geneVoxels.push({
                position: [x, y, z], // x=width, y=top-to-bottom(slicing), z=front-to-back
                blockData: 0,
                temperature: 0.5,
                humidity: 0.5,
                lighting: 15,
                voxelType: 1, // 1 = gene voxel
                voxelId: index, // Use spot index as gene voxel ID
                gene_name: spot.gene,
                spot_id: spot.spot_id,
                plane_id: spot.plane_id,
                rgb: rgb,
                parent_cell_id: spot.parent_cell_id,
                parent_cell_X: spot.parent_cell_X,
                parent_cell_Y: spot.parent_cell_Y,
                parent_cell_Z: spot.parent_cell_Z,
                original_coords: {x: spot.x, y: spot.y, z: spot.z}
            });
        });

        // Extract unique genes from the dataset for gene controls
        const uniqueGenes = [...new Set(dataset.spots.data.map(spot => spot.gene))];
        console.log('🧬 Found unique genes in selection:', uniqueGenes.length, uniqueGenes);
        
        // Build gene sets and colors for controls
        availableGenes.clear();
        selectedGenes.clear();
        geneColors.clear();
        
        uniqueGenes.forEach(gene => {
            availableGenes.add(gene);
            selectedGenes.add(gene); // Start with all genes visible
            
            // Get gene color and store as hex string
            const rgb = getGeneColor(gene);
            const color = d3.rgb(rgb[0], rgb[1], rgb[2]);
            geneColors.set(gene, color.formatHex());
        });
        
        console.log('🎨 Gene colors:', Object.fromEntries(geneColors));

        console.log('Transformed', geneVoxels.length, 'gene spots,', stoneVoxels.length, 'stone blocks,', cellVoxels.length, 'hole stone blocks, and', boundaryVoxels.length, 'boundary voxels');
        console.log('Sample gene block:', geneVoxels[0]);
        console.log('Sample stone block:', stoneVoxels[0]);
        console.log('Sample hole stone block:', cellVoxels[0]);
        console.log('Sample boundary voxel:', boundaryVoxels[0]);
        
        return {
            geneData: geneVoxels,
            stoneData: stoneVoxels,
            holeStoneData: cellVoxels, // Add hole stone data to return object
            boundaryData: boundaryVoxels, // Add boundary voxel data to return object
            bounds: {
                minX: 0,
                maxX: maxX,
                minY: 0,
                maxY: maxY,
                minZ: 0,
                maxZ: maxZ
            }
        };
    }

    // Transform the dataset (async)
    transformBioDataToBlocks(dataset).then(blockData => {

    // Helper functions for the minecraft layer
    function getBlockTemperature(d) {
        return d.temperature || 0.5;
    }

    function getBlockHumidity(d) {
        return d.humidity || 0.5;
    }

    function isBlockOpaque(x, y, z) {
        return false; // All blocks are visible for this demo
    }

    const INITIAL_VIEW_STATE = {
        target: [blockData.bounds.maxX/2, blockData.bounds.maxY/2, blockData.bounds.maxZ/2], // Center of actual chunk dimensions
        zoom: 2,
        orbitAxis: 'Y',
        rotationX: 0,
        rotationOrbit: -30,
        minZoom: 0,
        maxZoom: 20
    };

    const LIGHTING_EFFECT = new LightingEffect({
        ambient: new AmbientLight({
            color: [255, 255, 255],
            intensity: 0.6
        }),
        dir1: new DirectionalLight({
            color: [255, 255, 255],
            intensity: 1.0,
            direction: [-3, -6, -1]
        }),
        dir2: new DirectionalLight({
            color: [200, 220, 255],
            intensity: 0.4,
            direction: [3, -1, 0]
        })
    });

    const stoneGhostOpacity = 0.005; // Stone ghost opacity (> 0.001 shader alpha threshold)
    const geneGhostOpacity = 0.01;   // Gene ghost opacity (with lighting attenuation in shader)
    const lineGhostOpacity = 0.001;  // Line ghost opacity (separate control for visual matching)
    let currentSliceY = blockData.bounds.maxY; // Start with all visible (Y-axis slicing)
    let currentPlaneId = 0; // Current plane_id for slider display
    let showSpotLines = true; // Toggle for showing spot-to-parent lines
    let showBackground = true; // Toggle for showing background stone voxels
    let showHoleVoxels = false; // Toggle for showing hole voxels (cell boundary shapes)
    let showBoundaryVoxels = false; // Toggle for showing boundary voxels (red cell outlines)
    let showGhosting = true; // Toggle for showing ghosting effects
    
    // Calculate anisotropic scale from config
    const config = window.opener.window.config();
    const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
    const anisotropicScale = zVoxel / xVoxel;
    console.log(`Anisotropic scale from config: zVoxel(${zVoxel}) / xVoxel(${xVoxel}) = ${anisotropicScale}`);

    // Helper to create a VoxelLayer with common settings
    function createVoxelLayer(id, data, config) {
        if (data.length === 0) return null;
        
        return new VoxelLayer({
            id: id,
            data: data,
            getTemperature: getBlockTemperature,
            getHumidity: getBlockHumidity,
            getVoxelType: (d) => d.voxelType !== undefined ? d.voxelType : 0,
            getVoxelId: (d) => d.voxelId !== undefined ? d.voxelId : 0,
            getIsBlockOpaque: isBlockOpaque,
            sliceY: currentSliceY,
            anisotropicScale: anisotropicScale,
            ...config // Spread layer-specific config
        });
    }

    // Create a filled square glyph (replacement for complex glyphs)
    function createGeneGlyph(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        canvas.className = 'gene-glyph';
        
        const ctx = canvas.getContext('2d');
        
        // Fill with gene color
        ctx.fillStyle = color;
        ctx.fillRect(2, 2, 16, 16);
        
        // Add subtle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, 16, 16);
        
        return canvas;
    }

    // Build dynamic gene controls widget - matches main UI exactly
    function buildGeneControls() {
        const geneList = document.getElementById('geneList');
        geneList.innerHTML = ''; // Clear existing controls
        
        // Sort genes alphabetically for consistent display
        const sortedGenes = [...availableGenes].sort();
        
        sortedGenes.forEach(gene => {
            const geneItem = document.createElement('div');
            geneItem.className = 'gene-item';
            geneItem.dataset.gene = gene;
            
            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'gene-checkbox';
            checkbox.id = `gene-${gene}`;
            checkbox.checked = selectedGenes.has(gene);
            checkbox.addEventListener('change', () => toggleGene(gene, checkbox.checked));
            
            // Filled square glyph with gene color
            const glyph = createGeneGlyph(geneColors.get(gene));
            
            // Gene name with spot count
            const nameSpan = document.createElement('span');
            nameSpan.className = 'gene-name';
            
            // Count spots for this gene
            const geneSpotCount = blockData.geneData.filter(block => block.gene_name === gene).length;
            nameSpan.textContent = `${gene} (${geneSpotCount.toLocaleString()})`;
            
            // Click handler for the entire item
            geneItem.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    toggleGene(gene, checkbox.checked);
                }
            });
            
            geneItem.appendChild(checkbox);
            geneItem.appendChild(nameSpan);
            geneItem.appendChild(glyph);
            
            geneList.appendChild(geneItem);
        });
        
        console.log(`🎛️ Built gene controls for ${sortedGenes.length} genes`);
    }
    
    // Toggle individual gene visibility
    function toggleGene(gene, isVisible) {
        if (isVisible) {
            selectedGenes.add(gene);
        } else {
            selectedGenes.delete(gene);
        }
        
        console.log(`🧬 Gene ${gene}: ${isVisible ? 'shown' : 'hidden'}`);
        updateToggleAllButton();
        
        // Update layers
        deckgl.setProps({
            layers: createLayers()
        });
    }
    
    // Update the "Toggle All" button text and style based on current selection
    function updateToggleAllButton() {
        const toggleAllBtn = document.getElementById('toggleAllGenes');
        const totalGenes = availableGenes.size;
        const selected = selectedGenes.size;
        
        if (selected === totalGenes) {
            toggleAllBtn.textContent = 'Unselect All';
            toggleAllBtn.className = 'toggle-all-btn unselect';
        } else {
            toggleAllBtn.textContent = 'Select All';
            toggleAllBtn.className = 'toggle-all-btn';
        }
    }

    // Search functionality for gene filtering
    function filterGeneList(searchTerm) {
        const geneItems = document.querySelectorAll('.gene-item');
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        geneItems.forEach(item => {
            const geneName = item.dataset.gene.toLowerCase();
            const shouldShow = geneName.includes(lowerSearchTerm);
            item.style.display = shouldShow ? 'flex' : 'none';
        });
    }

    // Create line data connecting spots to their parent cells
    function createLinesData(solidOnly = true) {
        const lines = [];
        
        // Use the same integer bounds as the transformation
        const bounds = {
            left: Math.floor(dataset.bounds.left),
            right: Math.floor(dataset.bounds.right),
            top: Math.floor(dataset.bounds.top),
            bottom: Math.floor(dataset.bounds.bottom),
            depth: Math.floor(dataset.bounds.depth)
        };
        
        // Scale factors eliminated - direct 1:1 integer mapping
        // No more scaleX, scaleY, scaleZ needed!

        // Filter spots based on solid/ghost mode and gene selection
        const filteredGeneVoxels = solidOnly
            ? blockData.geneData.filter(block => 
                block.position[1] <= currentSliceY && selectedGenes.has(block.gene_name))  // solid spots
            : blockData.geneData.filter(block => 
                block.position[1] > currentSliceY && selectedGenes.has(block.gene_name));   // ghost spots
        
        filteredGeneVoxels.forEach(spotBlock => {
            // Check if this spot has valid parent cell coordinates (not null, undefined, or background cell)
            if (spotBlock.parent_cell_X !== null && spotBlock.parent_cell_X !== undefined &&
                spotBlock.parent_cell_Y !== null && spotBlock.parent_cell_Y !== undefined &&
                spotBlock.parent_cell_Z !== null && spotBlock.parent_cell_Z !== undefined &&
                spotBlock.parent_cell_id !== null && spotBlock.parent_cell_id !== undefined && 
                spotBlock.parent_cell_id !== 0) {
                
                // Source position: spot position (already in viewer coordinates)
                const sourcePosition = [
                    spotBlock.position[0], // viewer X
                    spotBlock.position[1], // viewer Y  
                    spotBlock.position[2]  // viewer Z
                ];
                
                // Target position: parent cell coordinates (transform to viewer coordinates with simple integer arithmetic)
                const parentCellX = Math.floor(spotBlock.parent_cell_X);  // Clean integer pixels
                const parentCellY = Math.floor(spotBlock.parent_cell_Y);  // Clean integer pixels  
                const parentCellZ = Math.floor(spotBlock.parent_cell_Z);  // Clean integer depth
                
                const parentViewerX = parentCellX - bounds.left;         // Global → Local X (simple subtraction)
                const parentViewerY = parentCellZ;                       // Z coordinate becomes Y (depth → slicing axis)
                const parentViewerZ = parentCellY - bounds.top;          // Global → Local Y→Z (simple subtraction)
                
                const targetPosition = [
                    parentViewerX,
                    parentViewerY,
                    parentViewerZ
                ];
                
                // Use the gene color for the line, but make it semi-transparent
                const geneColor = spotBlock.rgb || [255, 255, 255];
                const lineColor = [geneColor[0], geneColor[1], geneColor[2], 128]; // 50% transparency
                
                lines.push({
                    sourcePosition: sourcePosition,
                    targetPosition: targetPosition,
                    color: lineColor,
                    gene: spotBlock.gene_name,
                    spot_id: spotBlock.spot_id,
                    parent_cell_id: spotBlock.parent_cell_id
                });
            }
        });
        
        console.log(`Created ${lines.length} ${solidOnly ? 'solid' : 'ghost'} spot-to-parent lines from ${filteredGeneVoxels.length} spots`);
        
        return lines;
    }

    function createLayers() {
        return buildLayers({
            blockData,
            selectedGenes,
            currentSliceY,
            showBackground,
            showHoleVoxels,
            showBoundaryVoxels,
            showGhosting,
            stoneGhostOpacity,
            geneGhostOpacity,
            showSpotLines,
            lineGhostOpacity,
            createVoxelLayer,
            createLinesData,
            deck
        });
    }

    // Create the deck.gl instance
    const deckgl = new DeckGL({
        container: 'container',
        views: new OrbitView({id: 'orbit'}),
        initialViewState: INITIAL_VIEW_STATE,
        controller: true,
        effects: [LIGHTING_EFFECT],
        onWebGLInitialized: (gl) => {
            console.log('WebGL initialized!');
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(true);
        },
        onHover: (info) => {
            if (info.object && info.object.gene_name) {
                showChunkTooltip(info);
            } else {
                hideChunkTooltip();
            }
        },
        onClick: (info) => {
            if (info.object) {
                console.log('Clicked:', {
                    gene: info.object.gene_name, 
                    position: info.object.position,
                    original_coords: info.object.original_coords,
                    parent_cell: info.object.parent_cell_id
                });
            }
        },
        layers: createLayers()
    });

    // Initialize Z-slice slider via UI module
    initSliceSlider({
        deckgl,
        createLayers,
        planeIdToSliceY,
        getTotalPlanes: () => {
            if (window.opener && window.opener.window.config) {
                return window.opener.window.config().totalPlanes;
            }
            // Fallback to bounds-based estimate if config is unavailable
            return blockData.bounds.maxY + 1;
        },
        getCurrentPlaneId: () => currentPlaneId,
        setCurrentPlaneId: (v) => { currentPlaneId = v; },
        setCurrentSliceY: (v) => { currentSliceY = v; }
    });
    
    // Initialize minimal top-right controls via UI module
    initControls({
        deckgl,
        createLayers,
        setShowSpotLines: (v) => { showSpotLines = v; },
        setShowBackground: (v) => { showBackground = v; },
        setShowHoleVoxels: (v) => { showHoleVoxels = v; },
        setShowBoundaryVoxels: (v) => { showBoundaryVoxels = v; },
        setShowGhosting: (v) => { showGhosting = v; }
    });

    // Initialize genes panel UI module (build list, toggle, search, open/close)
    initGenesPanel({
        availableGenes,
        selectedGenes,
        blockData,
        createLayers,
        deckgl,
        geneColors
    });

    console.log('Bio demo initialized with', blockData.geneData.length, 'gene spots and', blockData.stoneData.length, 'stone blocks');
    
    }).catch(error => {
        console.error('❌ Failed to initialize chunk viewer:', error);
    });
});
