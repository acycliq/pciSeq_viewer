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

    const fromStart = state.channelOpacity[fromId] ?? 1;
    const toStart = state.channelOpacity[toId] ?? 0;
    const startTime = performance.now();

    const step = (now) => {
        const progress = Math.min(1, (now - startTime) / FADE_MS);

        state.channelOpacity[fromId] = fromStart * (1 - progress);
        state.channelOpacity[toId] = toStart + (1 - toStart) * progress;
        render();

        if (progress < 1) {
            state.channelFadeRAF = requestAnimationFrame(step);
        } else {
            state.channelOpacity[fromId] = 0;
            state.channelOpacity[toId] = 1;
            state.channelFadeRAF = null;
            render();
        }
    };

    state.channelFadeRAF = requestAnimationFrame(step);
}
