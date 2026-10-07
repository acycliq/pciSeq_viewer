/**
 * The guided tour: a short walk through the main controls for a new user.
 *
 * Two parts. STEPS is the tour itself, a plain list, one record per stop. The rest
 * is a small engine that dims the window, leaves a hole over one control and puts
 * a box of text next to it, with Back and Next.
 *
 * A step is:
 *   target  css selector(s) of what to point at. Several selectors are joined into
 *           one rectangle. No target means a box in the middle of the window.
 *   title   one line
 *   text    a few sentences, plain html allowed
 *   side    where the box goes: 'right', 'left', 'above' or 'below'
 *   before  optional function run before the step shows, for example to open the
 *           drawer so the target can be seen
 *
 * The tour opens the drawer and some of its sections as it goes. Whatever it
 * opened or closed is put back when it ends.
 */

import { showControlsPanel, hideControlsPanel } from './controlsPanel.js';
import { freezeOnCell, unfreeze } from './cellInfoPanel/index.js';
import { isMinimized, isFrozen, minimize } from './cellInfoPanel/panelState.js';
import { buildCellInfoData } from './ui/cellHoverHandler.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

const SEEN_KEY = 'tourSeen';
const PAD = 6;          // gap between a control and the edge of the hole, px
const GAP = 14;         // gap between the hole and the text box, px

// open one section of the drawer and close the others, so the target has room
function showSection(headerId) {
    showControlsPanel();
    document.querySelectorAll('.collapsible-header').forEach(header => {
        const content = header.nextElementSibling;
        if (!content || !content.classList.contains('section-content')) return;
        const open = header.id === headerId;
        header.classList.toggle('collapsed', !open);
        content.classList.toggle('collapsed', !open);
        if (open) header.scrollIntoView({ block: 'nearest' });
    });
}

// The label of the cell nearest to the middle of the window, or null when no run is
// loaded. A cell on the plane being shown is taken when there is one, so the map
// does not have to change plane to get to it.
function cellAtCentre() {
    const app = window.appState;
    const deckInstance = app && app.deckglInstance;
    if (!deckInstance || !app.cellDataMap || !app.cellDataMap.size || !window.config) return null;
    const config = window.config();
    const dims = { width: config.imageWidth, height: config.imageHeight, tileSize: 256 };
    const vp = deckInstance.getViewports()[0];
    const [cx, cy] = vp.unproject([vp.width / 2, vp.height / 2]);
    const [xVoxel, , zVoxel] = config.voxelSize || [1, 1, 1];
    let best = null, bestHere = null;
    for (const [label, cell] of app.cellDataMap) {
        const [x, y] = transformToTileCoordinates(cell.position.x, cell.position.y, dims);
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (!best || d < best.d) best = { label, d };
        // same rule as the cell lookup: plane p is the stretch from p up to p + 1
        const plane = Math.floor((cell.position.z || 0) * xVoxel / zVoxel);
        if (plane === app.currentPlane && (!bestHere || d < bestHere.d)) bestHere = { label, d };
    }
    return (bestHere || best).label;
}

// Go to a cell near the middle of the map and open the panel at the bottom right on
// it, as a click on the cell does. Done once per tour: the two stops about the panel
// share the same cell, and going Back and Next again does not fly a second time.
let tourCell = null;
function showCellPanel() {
    if (tourCell !== null) return;
    const label = cellAtCentre();
    if (label === null) return;             // no run loaded, the stop still shows the panel
    tourCell = label;
    const cell = window.appState.cellDataMap.get(label);
    freezeOnCell(buildCellInfoData(cell, label));
    if (window.cellLookup) window.cellLookup.search(label).catch(() => {});
}

const STEPS = [
    {
        title: 'A quick tour',
        text: 'A short walk through the main controls. <b>Next</b> and <b>Back</b> move ' +
              'through it, the arrow keys do the same, and <b>Esc</b> ends it.',
    },
    {
        title: 'The map',
        text: 'Drag to move and scroll to zoom. Each outline is a cell, coloured by its ' +
              'class. Each small marker is a spot, and its shape and colour tell the gene.',
    },
    {
        target: '#cellInfoPanel',
        side: 'left',
        before: showCellPanel,
        title: 'A cell and its panel',
        text: 'The map has moved to one cell, and this panel is about that cell. The ' +
              'table lists its gene counts. The donut chart shows the probability of ' +
              'each class, one slice per class, so a single big slice is a confident ' +
              'call and several slices are a cell that could be one of several classes.',
    },
    {
        target: '#cellInfoPanel',
        side: 'left',
        before: showCellPanel,
        title: 'Freeze and unfreeze',
        text: 'The panel follows the mouse: it shows whichever cell is under it. ' +
              '<b>Click</b> a cell to freeze the panel on that cell, so the mouse can ' +
              'move onto the panel and read it. Click the empty background, or press ' +
              '<b>Esc</b>, to unfreeze it.',
    },
    {
        target: '.main-controls',
        side: 'above',
        title: 'Planes',
        text: 'The slider moves through the planes of the image. The <b>Left</b> and ' +
              '<b>Right</b> keys do the same, and <b>A</b> lays all planes over each other. ' +
              'A spot is drawn biggest on its own plane and gets smaller as you move ' +
              'away from it.',
    },
    {
        target: '#controlsRail',
        side: 'right',
        before: hideControlsPanel,
        title: 'The drawer',
        text: 'Everything else is in the drawer. This strip opens and closes it.',
    },
    {
        target: ['#cellClassesHeader', '#cellClassesContent'],
        side: 'right',
        before: () => showSection('cellClassesHeader'),
        title: 'Cell classes',
        text: 'Every class with its colour and how many cells it has. The eye hides or ' +
              'shows a class on the map, and the box on top filters the list by name.',
    },
    {
        target: ['#genesHeader', '#genesContent'],
        side: 'right',
        before: () => showSection('genesHeader'),
        title: 'Genes',
        text: 'The same for the genes: marker, name and number of spots. Hide all and ' +
              'then show one or two to see where a gene sits.',
    },
    {
        target: ['#cellChartsHeader', '#cellChartsContent'],
        side: 'right',
        before: () => showSection('cellChartsHeader'),
        title: 'Charts',
        text: 'Summaries of the whole run, each opening in a panel over the map: the classes ' +
              'per plane, the share of each class, and the gene counts per class.',
    },
    {
        target: ['#regionsHeader', '#regionsContent'],
        side: 'right',
        before: () => showSection('regionsHeader'),
        title: 'Annotations',
        text: 'Draw a region on the map and give it a name. Regions can be saved to a ' +
              'file and opened again later.',
    },
    {
        target: ['#layersHeader', '#layersContent'],
        side: 'right',
        before: () => showSection('layersHeader'),
        title: 'Layers',
        text: 'What is drawn on the map: the background image and the cells, with how ' +
              'see-through they are. Normally only the cells of the plane on screen are ' +
              'drawn. <b>Cells from all planes</b> draws the cells of every plane at once, laid ' +
              'over each other, so the whole depth of the tissue is in one picture.',
    },
    {
        target: ['#toolsHeader', '#toolsContent'],
        side: 'right',
        before: () => showSection('toolsHeader'),
        title: 'Tools and the 3D view',
        text: 'Switch the <b>Selection tool</b> on, then hold <b>Ctrl</b> and drag a ' +
              'rectangle on the map. A second window opens with that piece of the ' +
              'tissue in 3D, its cells and genes drawn with depth across the planes.',
    },
    {
        target: '#railSearchBtn',
        side: 'right',
        title: 'Go to a cell',
        text: 'Type a cell label and the map moves to that cell. <b>Ctrl+F</b> opens ' +
              'the same box.',
    },
    {
        target: '#chatBtn',
        side: 'below',
        title: 'Ask about the run',
        text: 'The chat answers questions in plain words, for example why a cell got ' +
              'its class. It needs an API key, and a run that saved its ' +
              '<code>diagnostics.db</code>. With that file, <b>Ctrl+Click</b> on a cell ' +
              'or a spot also opens the numbers behind its call.',
    },
    {
        target: '#aboutBtn',
        side: 'below',
        title: 'That is it',
        text: 'This button opens a short description of the viewer, and the tour can ' +
              'be started again from there. <b>Help</b> in the menu starts it too.',
    },
];

let root = null;        // the overlay, null when no tour is running
let index = 0;
let frame = 0;          // the animation frame that keeps the hole on its target
let before = null;      // how the drawer looked before the tour

function remember() {
    const deckInstance = window.appState && window.appState.deckglInstance;
    before = {
        // where the map was, and how the cell panel was, for the stops that move them
        view: deckInstance ? deckInstance.viewManager.getViewState('ortho') : null,
        plane: window.appState ? window.appState.currentPlane : null,
        panelMinimized: isMinimized(),
        panelFrozen: isFrozen(),
        drawerCollapsed: document.getElementById('controlsPanel').classList.contains('collapsed'),
        sections: [...document.querySelectorAll('.collapsible-header')]
            .map(h => [h, h.classList.contains('collapsed')]),
    };
}

function putBack() {
    if (!before) return;
    for (const [header, collapsed] of before.sections) {
        const content = header.nextElementSibling;
        header.classList.toggle('collapsed', collapsed);
        if (content && content.classList.contains('section-content')) {
            content.classList.toggle('collapsed', collapsed);
        }
    }
    if (before.drawerCollapsed) hideControlsPanel(); else showControlsPanel();
    // the stops about the cell panel moved the map and opened the panel: undo both
    if (tourCell !== null) {
        if (!before.panelFrozen) unfreeze();
        if (before.panelMinimized) minimize();
        const deckInstance = window.appState && window.appState.deckglInstance;
        if (deckInstance && before.view) {
            if (before.plane !== null && window.updatePlane && window.appState.currentPlane !== before.plane) {
                window.updatePlane(before.plane);
            }
            deckInstance.setProps({ initialViewState: {
                ...before.view,
                transitionDuration: 700,
                transitionInterpolator: new deck.LinearInterpolator(['target', 'zoom']),
            } });
        }
        tourCell = null;
    }
    before = null;
}

// the rectangle round every target of the step, or null when it has none on screen
function targetRect(step) {
    if (!step.target) return null;
    const selectors = Array.isArray(step.target) ? step.target : [step.target];
    let box = null;
    for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        box = box
            ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top),
                right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
            : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return box;
}

// put the hole over the target and the text box next to it. Runs every frame while
// the tour is open, so the hole follows a drawer that is still sliding or a window
// being resized.
function place() {
    if (!root) return;
    const step = STEPS[index];
    const hole = root.querySelector('.tour-hole');
    const tip = root.querySelector('.tour-tip');
    const rect = targetRect(step);
    const W = window.innerWidth, H = window.innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left, top;

    if (!rect) {
        // nothing to point at: no hole, the box in the middle
        hole.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0;`;
        left = (W - tw) / 2;
        top = (H - th) / 2;
    } else {
        const x = Math.max(0, rect.left - PAD), y = Math.max(0, rect.top - PAD);
        const w = Math.min(W, rect.right + PAD) - x, h = Math.min(H, rect.bottom + PAD) - y;
        hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
        const side = step.side || 'right';
        if (side === 'right')      { left = x + w + GAP;  top = y; }
        else if (side === 'left')  { left = x - tw - GAP; top = y; }
        else if (side === 'above') { left = x + (w - tw) / 2; top = y - th - GAP; }
        else                       { left = x + (w - tw) / 2; top = y + h + GAP; }
    }
    // never off the window
    left = Math.min(Math.max(8, left), W - tw - 8);
    top = Math.min(Math.max(8, top), H - th - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    frame = requestAnimationFrame(place);
}

function show(i) {
    index = i;
    const step = STEPS[index];
    if (step.before) step.before();
    root.querySelector('.tour-title').textContent = step.title;
    root.querySelector('.tour-text').innerHTML = step.text;
    root.querySelector('.tour-count').textContent = `${index + 1} of ${STEPS.length}`;
    root.querySelector('.tour-back').disabled = index === 0;
    root.querySelector('.tour-next').textContent = index === STEPS.length - 1 ? 'Done' : 'Next';
}

function next() { if (index === STEPS.length - 1) endTour(); else show(index + 1); }
function back() { if (index > 0) show(index - 1); }

// The viewer has its own keys (Left and Right change the plane, Esc closes panels).
// While the tour is open they belong to the tour, so they are stopped here first.
function onKey(e) {
    const keys = { Escape: endTour, ArrowRight: next, Enter: next, ArrowLeft: back };
    const action = keys[e.key];
    e.stopPropagation();
    if (!action) return;
    e.preventDefault();
    action();
}

export function startTour() {
    if (root) return;
    remember();
    root = document.createElement('div');
    root.className = 'tour-root';
    root.innerHTML =
        '<div class="tour-hole"></div>' +
        '<div class="tour-tip" role="dialog" aria-live="polite">' +
            '<button class="tour-close" aria-label="End the tour">&times;</button>' +
            '<div class="tour-title"></div>' +
            '<div class="tour-text"></div>' +
            '<div class="tour-foot">' +
                '<span class="tour-count"></span>' +
                '<span class="tour-btns">' +
                    '<button class="tour-back">Back</button>' +
                    '<button class="tour-next">Next</button>' +
                '</span>' +
            '</div>' +
        '</div>';
    document.body.appendChild(root);
    root.querySelector('.tour-close').addEventListener('click', endTour);
    root.querySelector('.tour-back').addEventListener('click', back);
    root.querySelector('.tour-next').addEventListener('click', next);
    window.addEventListener('keydown', onKey, true);
    show(0);
    place();
    root.querySelector('.tour-next').focus();
}

export function endTour() {
    if (!root) return;
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    root = null;
    putBack();
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    const about = document.getElementById('aboutBtn');
    if (about) about.classList.remove('unseen');
}

// The tour is offered at the bottom of the About box, which the ? button opens, and
// in the Help menu. The ? pulses until the tour has been taken once, so a new user
// notices it without being interrupted.
export function initTour() {
    const about = document.getElementById('aboutBtn');
    const offer = document.getElementById('aboutTourBtn');
    if (!about || !offer) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
    if (!seen) about.classList.add('unseen');
    offer.addEventListener('click', () => {
        document.getElementById('aboutModal').classList.remove('active');
        startTour();
    });
    if (window.electronAPI && window.electronAPI.onStartTour) {
        window.electronAPI.onStartTour(() => startTour());
    }
}
