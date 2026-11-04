#!/bin/bash
# Start the viewer on a data folder with its debugging port open, run one check against
# it, stop the viewer, and count the renderer's console errors.
# Usage: tests/app/run.sh <check.mjs> <data folder> [check arguments]
# Example: tests/app/run.sh fingerprints.mjs ~/.config/pciSeq_viewer/sample_run/viewer_data
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
CHECK=$1; DATA=$2; shift 2
PORT=${PORT:-9333}
LOG=$(mktemp)

if curl -s "localhost:$PORT/json" > /dev/null 2>&1; then
    echo "port $PORT is busy: another viewer is running with its debugging port open" >&2
    exit 1
fi

"$REPO/node_modules/.bin/electron" "$REPO" --data="$DATA" --remote-debugging-port=$PORT --enable-logging=stderr --v=0 > "$LOG" 2>&1 &
VIEWER=$!
stop_viewer() {
    kill $VIEWER 2> /dev/null
    wait $VIEWER 2> /dev/null
    # the debugging port closes a moment after the process is gone
    for i in $(seq 1 20); do curl -s "localhost:$PORT/json" > /dev/null 2>&1 || break; sleep 0.5; done
    rm -f "$LOG"
}
trap stop_viewer EXIT

if ! node "$HERE/$CHECK" "$PORT" "$@"; then
    echo "--- last lines of the viewer's console, for the failure above" >&2
    grep -E 'CONSOLE' "$LOG" | tail -15 | sed -E 's/^\[[^]]*\] //' >&2
    exit 1
fi

ERRORS=$(grep -E 'CONSOLE' "$LOG" | grep -ciE 'uncaught|TypeError|ReferenceError|GL_INVALID|Worker error' || true)
READY=$(grep -o 'READY: ARROW interactive in [0-9.]*ms' "$LOG" | tail -1)
echo "viewer: $READY, console errors: $ERRORS"
