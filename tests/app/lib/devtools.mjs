// Talk to the running viewer the way Chrome's developer tools do.
//
// The app is started with --remote-debugging-port=<port> (tests/app/run.sh does
// that). connect() finds the viewer page on that port and returns an object with:
//   evaluate(expression)  run JavaScript in the page and get its value back
//   send(method, params)  any DevTools Protocol command (screenshots, input, profiler)
//   mouse(type, x, y, extra)  a real mouse event, as if the user did it
//   close()
// waitUntilInteractive(app) returns once the spots are streamed, the spot table is
// built and the gene glyph atlas exists, which is when a user could start working.

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function connect(port) {
    const target = await findViewerPage(port);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => { socket.onopen = resolve; });

    let nextId = 1;
    const pending = new Map();
    socket.onmessage = (message) => {
        const reply = JSON.parse(message.data);
        if (reply.id && pending.has(reply.id)) {
            pending.get(reply.id)(reply);
            pending.delete(reply.id);
        }
    };

    const send = (method, params = {}) => new Promise(resolve => {
        const id = nextId++;
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
        const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        const details = reply.result?.exceptionDetails;
        if (details) throw new Error(`page error: ${details.exception?.description || details.text}`);
        return reply.result?.result?.value;
    };

    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });

    return { evaluate, send, mouse, close: () => socket.close() };
}

// The page list on the debugging port names every window; the viewer is index.html.
async function findViewerPage(port) {
    for (let attempt = 0; attempt < 120; attempt++) {
        try {
            const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            const viewer = pages.find(page => page.type === 'page' && page.url.includes('index.html'));
            if (viewer) return viewer;
        } catch {
            // the app is still starting
        }
        await sleep(500);
    }
    throw new Error(`no viewer page on port ${port}`);
}

// Polled from here rather than awaited inside the page: the window starts on
// about:blank and navigates to the viewer, which would cut a promise left in the page.
const INTERACTIVE = `(() => {
    const state = window.appState;
    return Boolean(state && state.spotTable && state.arrowScatterCache
        && state.spotTable.length === state.arrowScatterCache.length && state.spotTable.length > 0
        && state.geneIconAtlas);
})()`;

export async function waitUntilInteractive(app, timeoutSeconds = 600) {
    await waitFor(app, INTERACTIVE, timeoutSeconds, 'interactive');
    // let the last redraws and the tile fetches settle
    await sleep(3000);
}

// The app's modules have run once window.appState exists.
export function waitForAppState(app) {
    return waitFor(app, 'Boolean(window.appState)', 60, 'loaded');
}

async function waitFor(app, condition, timeoutSeconds, what) {
    for (let i = 0; i < timeoutSeconds * 2; i++) {
        const met = await app.evaluate(condition).catch(() => false);
        if (met) return;
        await sleep(500);
    }
    throw new Error(`the viewer did not become ${what} within ${timeoutSeconds} s`);
}

// Centre of the window, where the pans and wheel zooms happen.
export async function windowCentre(app) {
    const size = JSON.parse(await app.evaluate(`JSON.stringify({ w: window.innerWidth, h: window.innerHeight })`));
    return { x: Math.round(size.w / 2), y: Math.round(size.h / 2), width: size.w, height: size.h };
}

// A frame counter in the page: frames drawn and the longest gap since the last reset.
export async function installFrameCounter(app) {
    await app.evaluate(`(() => {
        window.__frames = { count: 0, last: performance.now(), worst: 0, start: performance.now() };
        const tick = (now) => {
            const f = window.__frames;
            f.count++;
            f.worst = Math.max(f.worst, now - f.last);
            f.last = now;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    })()`);
}

export function resetFrameCounter(app) {
    return app.evaluate(`(() => { const f = window.__frames; f.count = 0; f.worst = 0; f.last = f.start = performance.now(); })()`);
}

export async function readFrameRate(app) {
    const f = JSON.parse(await app.evaluate(`JSON.stringify({
        count: window.__frames.count, worst: window.__frames.worst,
        seconds: (performance.now() - window.__frames.start) / 1000 })`));
    return { fps: Math.round(f.count / f.seconds), worstFrameMs: Math.round(f.worst) };
}

// A plane step through the slider, as the user would do it.
export const PLANE_STEP = (delta) => `(() => {
    const slider = document.getElementById('planeSlider');
    slider.value = String(Number(slider.value) + (${delta}));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
})()`;

// The first gene in the drawer, toggled.
export const GENE_TOGGLE = `document.querySelector('#genesList .cell-class-item').click()`;

// Resolves after two animation frames, when a layer change is on screen.
export const TWO_FRAMES = `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`;
