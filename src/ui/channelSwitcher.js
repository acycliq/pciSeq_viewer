/**
 * Channel Switcher
 *
 * Builds the top-right radio group that picks which background base layer
 * (imaging channel, e.g. HC, DAPI) feeds the slippy-map tiles. It is a
 * Google-Maps-style basemap selector: exactly one channel is shown at a time.
 *
 * Wiring:
 *   - channel list comes from config via getTileChannels() (config/constants.js),
 *     passed in here as channelInfo by the app startup (src/app.js).
 *   - on selection it cross-fades to the chosen channel (crossfadeToChannel),
 *     which animates state.channelOpacity and calls renderCallback (updateAllLayers).
 *
 * The control hides itself when the dataset has fewer than two channels,
 * so single-channel datasets look exactly as before.
 */

import { crossfadeToChannel } from '../layers/channelCrossfade.js';

const CONTAINER_ID = 'channelSwitcher';

export function initChannelSwitcher(channelInfo, state, renderCallback) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const channels = channelInfo && channelInfo.channels ? channelInfo.channels : [];

    // Nothing to switch between - keep the control hidden
    if (channels.length < 2) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    channels.forEach(channel => {
        const option = document.createElement('label');
        option.className = 'channel-option';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'background-channel';
        radio.value = channel.id;
        radio.checked = channel.id === state.currentChannel;

        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            crossfadeToChannel(channel.id, state, renderCallback);
        });

        const text = document.createElement('span');
        text.textContent = channel.label;

        option.appendChild(radio);
        option.appendChild(text);
        container.appendChild(option);
    });
}