/**
 * Images the user pastes (Ctrl+V) or drops into the chat, for example a screenshot
 * of a panel. They wait as thumbnails above the prompt until the question is sent,
 * and each can be removed with its x. Big ones are shrunk first: the longest side
 * to 1568 px, the size Anthropic recommends, so a screenshot costs fewer tokens.
 */

const MAX_SIDE = 1568;
const MAX_IMAGES = 3;
const KEEP_AS_IS = ['image/png', 'image/jpeg'];

let pending = [];      // [{ media_type, data }], data is base64 without the prefix
let strip = null;      // the element the thumbnails go in

const readAsDataUrl = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
});

// a data URL, shrunk and re-encoded as png when it is too big or not png/jpeg
async function prepare(file) {
    const url = await readAsDataUrl(file);
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && KEEP_AS_IS.includes(file.type)) return url;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

function render() {
    strip.innerHTML = '';
    strip.classList.toggle('hidden', pending.length === 0);
    pending.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = 'chat-attachment';
        item.innerHTML = `<img alt="pasted image" src="data:${p.media_type};base64,${p.data}">` +
                         '<button type="button" title="Remove">&times;</button>';
        item.querySelector('button').addEventListener('click', () => { pending.splice(i, 1); render(); });
        strip.appendChild(item);
    });
}

async function add(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/') || pending.length >= MAX_IMAGES) continue;
        const url = await prepare(file);
        const [head, data] = url.split(',');
        pending.push({ media_type: head.slice(5, head.indexOf(';')), data });
    }
    render();
}

const imagesIn = list => Array.from(list || []).filter(f => f.type && f.type.startsWith('image/'));

export function initChatAttachments(input, stripEl) {
    strip = stripEl;
    input.addEventListener('paste', e => {
        const files = imagesIn(Array.from(e.clipboardData?.items || []).map(it => it.getAsFile()).filter(Boolean));
        if (files.length) { e.preventDefault(); add(files); }
    });
    const target = input.closest('.chat-session') || input;
    target.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    target.addEventListener('drop', e => {
        const files = imagesIn(e.dataTransfer?.files);
        if (files.length) { e.preventDefault(); add(files); }
    });
    render();
}

// the images waiting to go with the next question; the strip is emptied
export function takeAttachments() {
    const out = pending;
    pending = [];
    render();
    return out;
}

export function hasAttachments() {
    return pending.length > 0;
}
