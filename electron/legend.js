// What the map legend says, for the chat's tools: the colour of each class, and
// the colour and shape of each gene's spots.
//
// Only the window knows them (the schemes in config/ and src/glyphs, an imported
// one), so it sends the legend whenever it changes (src/legendSync.js) and it is
// kept here.

let classes = {};         // class name -> '#rrggbb'
let defaultClass = null;  // what a class with no entry is drawn in
let genes = {};           // gene name -> { colour: '#rrggbb', shape: 'diamond' }
let defaultGene = null;   // what a gene with no entry is drawn with

function init(ipcMain) {
  ipcMain.on('legend', (_event, legend) => {
    classes = (legend && legend.classes) || {};
    defaultClass = (legend && legend.defaultClass) || null;
    genes = (legend && legend.genes) || {};
    defaultGene = (legend && legend.defaultGene) || null;
  });
}

// null before the window has sent the legend; the default for a class with no entry
function classColour(name) {
  return classes[name] ?? defaultClass;
}

// null before the window has sent the legend; the default for a gene with no entry
function geneGlyph(name) {
  return genes[name] ?? defaultGene;
}

module.exports = { init, classColour, geneGlyph };
