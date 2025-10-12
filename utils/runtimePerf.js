// Simple end-to-end load timing + memory snapshot (renamed to avoid ad blockers)

const Perf = (() => {
  let startedAt = null;
  let ready = false;

  function isEnabled() {
    try { return !!(window.advancedConfig && window.advancedConfig().performance.showPerformanceStats); }
    catch { return true; }
  }

  function fmtMs(ms) { return `${ms.toFixed(1)}ms`; }

  function getMemorySnapshot() {
    const m = (performance && performance.memory) ? performance.memory : null;
    if (!m) return null;
    return {
      usedMB: (m.usedJSHeapSize / (1024 * 1024)).toFixed(1),
      totalMB: (m.totalJSHeapSize / (1024 * 1024)).toFixed(1),
      limitMB: (m.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)
    };
  }

  return {
    start(label = 'app') {
      if (!isEnabled()) return;
      startedAt = performance.now();
      console.log(`Perf: start (${label})`);
    },
    markInteractive(kind = 'tsv', extra = {}) {
      if (!isEnabled() || ready) return;
      ready = true;
      const now = performance.now();
      const total = startedAt ? (now - startedAt) : (now - performance.timeOrigin);
      const mem = getMemorySnapshot();
      const memStr = mem ? ` | mem used ${mem.usedMB}MB / total ${mem.totalMB}MB (limit ${mem.limitMB}MB)` : '';
      const planeStr = (typeof extra.plane === 'number') ? ` plane ${extra.plane}` : '';
      console.log(`READY: ${kind.toUpperCase()} interactive in ${fmtMs(total)}${planeStr}${memStr}`);
    }
  };
})();

export default Perf;

