// The colour each class is drawn in on the map, for the chat's cell tool.
//
// Only the window knows the colours (the scheme in config/, an imported one, a
// made-up colour for a class the scheme lacks), so it sends the whole table
// whenever the colours change (src/classColourSync.js) and it is kept here.

let colours = {};   // class name -> '#rrggbb'

function init(ipcMain) {
  ipcMain.on('class-colours', (_event, table) => { colours = table || {}; });
}

// '#rrggbb', or null before the window has sent the table or for an unknown class
function colourOf(className) {
  return colours[className] ?? null;
}

module.exports = { init, colourOf };
