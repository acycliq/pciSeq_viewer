/**
 * Configuration Examples
 * 
 * Copy and paste these examples into your config.js file to quickly
 * set up the viewer for common scenarios.
 */

// === EXAMPLE 1: Small Dataset (20 planes) ===
/*
function config() {
    return {
        totalPlanes: 20,
        startingPlane: 10,
        imageWidth: 3000,
        imageHeight: 2000,
        
        geneDataFile: "./data/my-gene-data.tsv",
        cellBoundaryFiles: "./boundaries/plane_{plane}.tsv",
        backgroundTiles: "https://myserver.com/tiles/dataset1/plane_{plane}/{z}/{y}/{x}.jpg",
        
        showBackgroundImages: true,
        showCellBoundaries: true,
        showGeneMarkers: true,
        geneMarkerSize: 1.2
    };
}
*/

// === EXAMPLE 2: Large Dataset (200 planes) ===
/*
function config() {
    return {
        totalPlanes: 200,
        startingPlane: 100,
        imageWidth: 8000,
        imageHeight: 6000,
        
        geneDataFile: "./data/large-gene-dataset.tsv",
        cellBoundaryFiles: "./planes/z{plane}_boundaries.tsv",
        backgroundTiles: "https://storage.cloud.com/big-dataset/tiles_{plane}/{z}/{y}/{x}.png",
        
        showBackgroundImages: true,
        showCellBoundaries: false, // start with polygons hidden for performance
        showGeneMarkers: true,
        geneMarkerSize: 0.8
    };
}
*/

// === EXAMPLE 3: Local Files Only (no internet required) ===
/*
function config() {
    return {
        totalPlanes: 50,
        startingPlane: 25,
        imageWidth: 4096,
        imageHeight: 4096,
        
        geneDataFile: "./local-data/genes.tsv",
        cellBoundaryFiles: "./local-data/boundaries/plane_{plane}.tsv",
        backgroundTiles: "./local-tiles/plane_{plane}/{z}/{y}/{x}.jpg",
        
        showBackgroundImages: true,
        showCellBoundaries: true,
        showGeneMarkers: true,
        geneMarkerSize: 1.0
    };
}
*/

// === EXAMPLE 4: Different File Naming Convention ===
/*
function config() {
    return {
        totalPlanes: 75,
        startingPlane: 35,
        imageWidth: 5000,
        imageHeight: 5000,
        
        geneDataFile: "./experiment_A/gene_expression.tsv",
        cellBoundaryFiles: "./experiment_A/cell_masks/slice_{plane}_masks.tsv",
        backgroundTiles: "https://data.university.edu/experiment_A/images/slice_{plane}/zoom_{z}/row_{y}/col_{x}.jpg",
        
        showBackgroundImages: true,
        showCellBoundaries: true,
        showGeneMarkers: true,
        geneMarkerSize: 1.5
    };
}
*/

// === EXAMPLE 5: Demo/Presentation Mode ===
/*
function config() {
    return {
        totalPlanes: 100,
        startingPlane: 50,
        imageWidth: 6411,
        imageHeight: 4412,
        
        geneDataFile: "./demo/sample-genes.tsv",
        cellBoundaryFiles: "./demo/plane_{plane}.tsv",
        backgroundTiles: "https://demo.website.com/sample-tiles/plane_{plane}/{z}/{y}/{x}.jpg",
        
        showBackgroundImages: true,
        showCellBoundaries: true,
        showGeneMarkers: true,
        geneMarkerSize: 1.2 // slightly larger for presentation
    };
}
*/

// === QUICK TIPS ===
/*

1. File Paths:
   - Use "./" for files in the same directory as your HTML file
   - Use "../" to go up one directory level
   - Use full URLs for files on other servers

2. Placeholders:
   - {plane} gets replaced with the plane number (0, 1, 2, etc.)
   - {z}, {y}, {x} are for tile coordinates
   - Make sure your actual files match these patterns!

3. Image Dimensions:
   - These should match your actual image size in pixels
   - You can find this by opening one of your images in an image editor

4. Total Planes:
   - Count how many plane files you have
   - If you have plane_0.tsv through plane_99.tsv, you have 100 planes

5. Starting Plane:
   - Pick a plane that shows interesting data
   - Usually somewhere in the middle of your dataset

6. Gene Marker Size:
   - 1.0 = normal size
   - 0.5 = half size, 2.0 = double size
   - Adjust based on your screen size and data density

*/