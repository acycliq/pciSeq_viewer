/**
 * Modernized Glyph Path Module
 * 
 * Provides high-quality geometric paths for gene markers.
 * Optimized for anti-aliasing and visual clarity.
 */

const GLYPH_DRAWERS = {
    // Perfect 6-point star using polar math
    star6: (ctx, p, r) => {
        const points = 6;
        const inset = 0.5;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? r : r * inset;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            ctx.lineTo(p.x + radius * Math.cos(angle), p.y + radius * Math.sin(angle));
        }
        ctx.closePath();
    },

    // Perfect 5-point star
    star5: (ctx, p, r) => {
        const points = 5;
        const inset = 0.4;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? r : r * inset;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            ctx.lineTo(p.x + radius * Math.cos(angle), p.y + radius * Math.sin(angle));
        }
        ctx.closePath();
    },

    // Clean elongated diamond
    diamond: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 1.1);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r * 1.1);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
    },

    // Rounded square (Modern aesthetic)
    square: (ctx, p, r) => {
        const corner = r * 0.3; // 30% corner radius
        ctx.beginPath();
        ctx.moveTo(p.x - r + corner, p.y - r);
        ctx.lineTo(p.x + r - corner, p.y - r);
        ctx.quadraticCurveTo(p.x + r, p.y - r, p.x + r, p.y - r + corner);
        ctx.lineTo(p.x + r, p.y + r - corner);
        ctx.quadraticCurveTo(p.x + r, p.y + r, p.x + r - corner, p.y + r);
        ctx.lineTo(p.x - r + corner, p.y + r);
        ctx.quadraticCurveTo(p.x - r, p.y + r, p.x - r, p.y + r - corner);
        ctx.lineTo(p.x - r, p.y - r + corner);
        ctx.quadraticCurveTo(p.x - r, p.y - r, p.x - r + corner, p.y - r);
        ctx.closePath();
    },

    // Triangles with softened tips
    triangleUp: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 1.1);
        ctx.lineTo(p.x + r, p.y + r * 0.9);
        ctx.lineTo(p.x - r, p.y + r * 0.9);
        ctx.closePath();
    },

    triangleDown: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + r * 1.1);
        ctx.lineTo(p.x + r, p.y - r * 0.9);
        ctx.lineTo(p.x - r, p.y - r * 0.9);
        ctx.closePath();
    },

    triangleRight: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x + r * 1.1, p.y);
        ctx.lineTo(p.x - r * 0.9, p.y + r);
        ctx.lineTo(p.x - r * 0.9, p.y - r);
        ctx.closePath();
    },

    triangleLeft: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x - r * 1.1, p.y);
        ctx.lineTo(p.x + r * 0.9, p.y + r);
        ctx.lineTo(p.x + r * 0.9, p.y - r);
        ctx.closePath();
    },

    // Radial markers with rounded line caps
    cross: (ctx, p, r) => {
        ctx.beginPath();
        const s = r * 0.8;
        ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y - s);
    },

    plus: (ctx, p, r) => {
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
        ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r);
    },

    // Radial asterisk with slightly shorter diagonals (old look)
    asterisk: (ctx, p, r) => {
        ctx.beginPath();
        const DIAGONAL_SCALE = 0.85; // scale for 45°/135° arms
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 4;
            const scale = (i % 2 === 1) ? DIAGONAL_SCALE : 1.0; // diagonals shortened
            const cos = Math.cos(angle) * r * scale;
            const sin = Math.sin(angle) * r * scale;
            ctx.moveTo(p.x - cos, p.y - sin);
            ctx.lineTo(p.x + cos, p.y + sin);
        }
    },

    circle: (ctx, p, r) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.closePath();
    },

    point: (ctx, p, r) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
        ctx.closePath();
    }
};

/**
 * Main function used by the atlas builder to draw a glyph onto a canvas
 */
function ctxPath(glyphName, ctx, p, r) {
    // Set global line styles for a more modern, smooth feel
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const draw = GLYPH_DRAWERS[glyphName] || GLYPH_DRAWERS.circle;
    
    if (!GLYPH_DRAWERS[glyphName]) {
        console.warn(`[Glyph] Unknown shape "${glyphName}", falling back to circle.`);
    }

    draw(ctx, p, r);
    return ctx;
}
