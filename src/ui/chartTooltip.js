// Singleton floating tooltip shared across all charts

let _tip = null;

function getTooltip() {
    if (!_tip) {
        _tip = document.createElement('div');
        _tip.className = 'chart-tooltip';
        document.body.appendChild(_tip);
    }
    return _tip;
}

export function showTooltip(html, x, y) {
    const tip = getTooltip();
    tip.innerHTML = html;
    tip.style.left = `${x + 10}px`;
    tip.style.top  = `${y - 10}px`;
    tip.style.opacity = 1;
}

export function moveTooltip(x, y) {
    const tip = getTooltip();
    tip.style.left = `${x + 10}px`;
    tip.style.top  = `${y - 10}px`;
}

export function hideTooltip() {
    getTooltip().style.opacity = 0;
}
