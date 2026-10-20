/**
 * The one place that answers "what colour is this class?".
 *
 * state.cellClassColors holds the explicit colours: the active scheme's for the
 * classes of the run (seedClassColours, at startup), then whatever Import, Cell
 * Class Colours adds or replaces. A class with no entry gets the default:
 * DEFAULT_CLASS_COLOUR from config/colorSchemes.js, or the colour an import file
 * gives under the name "*". Everything that draws a class, the map, the drawer,
 * the charts, the cell panel, the tooltip and the chat legend, asks here and
 * nowhere else.
 *
 * Both the scheme (classColorsCodes) and DEFAULT_CLASS_COLOUR are globals from
 * the classic scripts in config/, loaded by index.html before the modules.
 */
import { state } from './state/stateManager.js';

let defaultRgb = hexToRgb(DEFAULT_CLASS_COLOUR);

export function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16)
    ];
}

export function rgbToHex(rgb) {
    return '#' + rgb.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// [r, g, b]
export function classColour(name) {
    return state.cellClassColors.get(name) || defaultRgb;
}

// '#rrggbb', for the DOM and the charts
export function classColourHex(name) {
    return rgbToHex(classColour(name));
}

export function defaultClassColour() {
    return defaultRgb;
}

// An import file's "*" entry
export function setDefaultClassColour(rgb) {
    defaultRgb = rgb;
}

export function resetDefaultClassColour() {
    defaultRgb = hexToRgb(DEFAULT_CLASS_COLOUR);
}

// Fill state.cellClassColors from the active scheme, for the classes of the run.
// Classes the scheme does not list get no entry, so they take the default.
export function seedClassColours(classNames) {
    const scheme = new Map(classColorsCodes().map(entry => [entry.className, entry.color]));
    for (const name of classNames) {
        const hex = scheme.get(name);
        if (hex) state.cellClassColors.set(name, hexToRgb(hex));
    }
}

// A string that changes whenever any class colour or the default does. deck.gl
// layers put it in updateTriggers, because the Map keeps its identity when its
// entries change and the layer would not repaint after an import.
export function classColourToken() {
    let token = 'default:' + defaultRgb + ';';
    for (const [name, rgb] of state.cellClassColors) token += name + ':' + rgb + ';';
    return token;
}
