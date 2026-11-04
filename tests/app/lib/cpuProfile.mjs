// Sample the page's CPU while an action runs and report where the time went, by
// function. Uses the DevTools profiler; the self time of each function is summed.

export async function startProfiler(app) {
    await app.send('Profiler.enable');
    await app.send('Profiler.setSamplingInterval', { interval: 200 });
    await app.send('Profiler.start');
}

export async function stopProfiler(app, topCount = 10) {
    const { result } = await app.send('Profiler.stop');
    return topFunctions(result.profile, topCount);
}

function topFunctions(profile, topCount) {
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const selfTime = new Map();
    let totalMs = 0;
    for (let i = 0; i < profile.samples.length; i++) {
        const frame = nodes.get(profile.samples[i]).callFrame;
        const ms = profile.timeDeltas[i] / 1000;
        totalMs += ms;
        const where = frame.url ? `${frame.functionName || '(anonymous)'} ${shortUrl(frame.url)}:${frame.lineNumber + 1}` : `(${frame.functionName})`;
        selfTime.set(where, (selfTime.get(where) || 0) + ms);
    }
    const top = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, topCount);
    return { sampledMs: Math.round(totalMs), top: top.map(([where, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${where}`) };
}

function shortUrl(url) {
    return url.replace(/^app:\/\/index.html\//, '').replace(/^.*\/lib\/vendor\//, 'vendor/');
}
