// What the map legend says, for the chat's tools: the colour of each class, and
// the colour and shape of each gene's spots.
//
// Only the window knows them (the schemes in config/ and src/glyphs, an imported
// one), so it sends the legend whenever it changes (src/legendSync.js) and it is
// kept here.

let classes = {};   // class name -> '#rrggbb'
let genes = {};     // gene name -> { colour: '#rrggbb', shape: 'diamond' }

function init(ipcMain) {
  ipcMain.on('legend', (_event, legend) => {
    classes = (legend && legend.classes) || {};
    genes = (legend && legend.genes) || {};
  });
}

// null before the window has sent the legend, or for a name it does not have
function classColour(name) {
  return classes[name] ?? null;
}

function geneGlyph(name) {
  return genes[name] ?? null;
}

module.exports = { init, classColour, geneGlyph };
