/**
 * Channel Cross-fade
 *
 * Smoothly transitions the background between two imaging channels by animating
 * their render opacities, instead of swapping layers instantly (which showed a
 * black gap and a left-to-right tile "sweep").
 *
 * Both channels are kept mounted and warm (see buildTileLayers), so the incoming
 * channel's tiles are already loaded; fading its opacity from 0 to 1 reveals the
 * full image at once. The outgoing channel fades 1 to 0 over the same window.
 *
 * Wiring:
 *   - called by the channel switcher (src/ui/channelSwitcher.js) on selection.
 *   - reads/writes state.currentChannel, state.channelOpacity, state.channelFadeRAF.
 *   - calls render() (updateAllLayers) each animation frame.
 */

const FADE_MS = 250;

export function crossfadeToChannel(toId, state, render) {
    const fromId = state.currentChannel;
    if (toId === fromId) return;

    // Interrupt any fade already in progress and start from the live opacities,
    // so rapid switches stay smooth.
    if (state.channelFadeRAF) {
        cancelAnimationFrame(state.channelFadeRAF);
        state.channelFadeRAF = null;
    }

    state.currentChannel = toId;

    // Snapshot every channel's current opacity. A prior interrupted fade can
    // leave more than one channel partly visible, so we drive them all to 0,
    // not just the immediate outgoing one, or they linger as ghost layers.
    const startOpacity = { ...state.channelOpacity };
    if (startOpacity[toId] === undefined) startOpacity[toId] = 0;
    const channelIds = Object.keys(startOpacity);
    const startTime = performance.now();

    const step = (now) => {
        const progress = Math.min(1, (now - startTime) / FADE_MS);

        for (const id of channelIds) {
            const from = startOpacity[id];
            state.channelOpacity[id] = id === toId
                ? from + (1 - from) * progress
                : from * (1 - progress);
        }
        // render() rebuilds the whole layer stack each frame (~12 frames over the
        // fade). Fine at current scale; revisit if it stutters on very large spot sets.
        render();

        if (progress < 1) {
            state.channelFadeRAF = requestAnimationFrame(step);
        } else {
            for (const id of channelIds) {
                state.channelOpacity[id] = id === toId ? 1 : 0;
            }
            state.channelFadeRAF = null;
            render();
        }
    };

    state.channelFadeRAF = requestAnimationFrame(step);
}
