// Fixed figures from the documentation that the chat can show, for show_figure.
// Each one is a PNG in electron/figures, rendered from the SVG next to it by
// scripts/render_figure.js.
//
// The figure is marked display_only: chat.js shows it to the user but does not
// send it to the model, which knows what it shows from the tool description and
// so does not need to spend tokens looking at it.

const fs = require('fs');
const path = require('path');

const FIGURES = {
  factor_pyramid: {
    file: 'factor_pyramid.png',
    caption: 'Inefficiency, eta, theta and gamma, ordered by granularity.',
  },
};

function showFigure(name) {
  const figure = FIGURES[name];
  if (!figure) return { error: `unknown figure ${name}; known: ${Object.keys(FIGURES).join(', ')}` };
  const data = fs.readFileSync(path.join(__dirname, 'figures', figure.file)).toString('base64');
  return {
    __image: { media_type: 'image/png', data, display_only: true },
    info: { shown: name, caption: figure.caption },
  };
}

module.exports = { FIGURES, showFigure };
