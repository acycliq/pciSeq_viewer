/**
 * Channel Switcher
 *
 * Builds the top-right radio group that picks which background imaging channel
 * (e.g. DAPI, GCaMP) feeds the slippy-map tiles. It is a Google-Maps-style
 * basemap selector: exactly one channel is shown at a time.
 *
 * Wiring:
 *   - channel list comes from the main process via
 *     window.electronAPI.getTileChannels() (passed in as channelInfo).
 *   - on selection it sets state.currentChannel and calls renderCallback
 *     (updateAllLayers), the same render path the layer toggles use.
 *
 * The control hides itself when the dataset has fewer than two channels,
 * so single-channel datasets look exactly as before.
 */

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
            state.currentChannel = channel.id;
            renderCallback();
        });

        const text = document.createElement('span');
        text.textContent = channel.label;

        option.appendChild(radio);
        option.appendChild(text);
        container.appendChild(option);
    });
}
