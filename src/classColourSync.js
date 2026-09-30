/**
 * Tells the main process which colour each class is drawn in, so the chat's cell
 * tool can say it (electron/classColours.js keeps the table). Call it whenever the
 * class colours change.
 */
import { state } from './state/stateManager.js';

const toHex = (rgb) => '#' + rgb.slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export function sendClassColours() {
    if (!window.electronAPI?.setClassColours) return;
    const table = {};
    state.cellClassColors.forEach((rgb, name) => { table[name] = toHex(rgb); });
    window.electronAPI.setClassColours(table);
}
