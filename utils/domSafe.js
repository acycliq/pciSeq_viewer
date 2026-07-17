// Escape a value for safe insertion into HTML, including inside single or
// double quoted attributes. Coerces non-strings (numbers, null, undefined) so
// callers can pass raw field values without a guard.
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
