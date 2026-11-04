# App checks

Checks that drive the running viewer the way a user does and measure what comes out:
data checksums, hover lines, screenshots, frame rates and CPU profiles. They exist so
that a change to the spot pipeline (worker, loader, SpotTable, layers) can be proven
harmless in minutes: same checksums, same pictures, same or better numbers.

They are not unit tests. `npm test` does not run them; they need a data folder and a
screen, and they take ten seconds to a minute each.

## How to run

    tests/app/run.sh <check> <data folder> [arguments]

`run.sh` starts the viewer on the folder with its debugging port open (9333, or `PORT`),
runs the check against it over the Chrome DevTools Protocol, stops the viewer and
reports its time to interactive and the number of console errors. One check per run.
The folder must have been opened in the viewer once before, so that its voxel size is
known and no dialog is waiting.

    SAMPLE=~/.config/pciSeq_viewer/sample_run/viewer_data
    tests/app/run.sh fingerprints.mjs $SAMPLE
    tests/app/run.sh screenshots.mjs $SAMPLE tests/app/out before
    python3 tests/app/pixels.py tests/app/out/before_*.png

`pixels.py` needs Python with Pillow and numpy. Screenshots go to `tests/app/out`,
which git ignores.

## The checks

| Check | What it tells you |
|---|---|
| `fingerprints.mjs` | Four checksums of the spot data as the app holds it: per gene, per cell, per spot, and the spot buffers read back from the GPU. Equal numbers before and after a change prove the data did not change. |
| `hover.mjs` | For three cells, the hover lines drawn equal the spots of the cell. |
| `screenshots.mjs out label` | The initial view and a zoomed view as PNG. Compare with `pixels.py`: the lit fraction is stable between runs, single pixels are not, because overlapping spots are drawn in varying order. |
| `toggles.mjs out label` | Screenshots after gene off, grey out misreads, hide misreads. Compare with `pixels.py`. |
| `icon-layer.mjs` | At deep zoom, the icon layer holds exactly the spots a scan of every row finds in the viewport. |
| `render.mjs [quick]` | Frames per second and worst frame while panning and zooming with real input, plus the time until a gene toggle, a plane step and a deep-zoom rebuild are on screen. The first pan includes warm-up and is slower. |
| `profile.mjs` | Where the CPU time goes for a plane step, a gene toggle and a deep-zoom rebuild, function by function. |
| `profile-load.mjs` | The same for the whole load. |

`lib/devtools.mjs` holds the connection and the page-side helpers every check shares;
`lib/cpuProfile.mjs` the profiler.

## Reference values, sample run, 3,018,812 spots, Intel Iris Xe, 4 Nov 2026

    fingerprints  geneHash 2259702382  cellHash 2414583382  parentHash 1067590619  cacheHash 4226309834
    screenshots   initial lit 0.5502          zoomed lit 0.2056
    toggles       all 0.5502  geneOff 0.5380  greyOut 0.5503 (saturation 48.6)  hide 0.3673
    render        pan 60 fps, zoom 58 fps, deep-zoom rebuild 19 ms, gene toggle 20 to 31 ms, plane step 69 to 103 ms
    load          interactive in 2.9 to 3.1 s

The synthetic 20M run (`/home/dimitris/pciseq_runs/synthetic_20M/viewer_data`) on the
same GPU: interactive in 8.2 to 8.5 s, low-zoom pan 27 to 29 fps, gene toggle 28 ms,
plane step 67 to 102 ms, deep-zoom rebuild 30 ms, JS heap 2.3 GB, spot buffers on the
GPU 588 MB, renderer process 2.7 GB resident. `fingerprints.mjs` is for the sample only:
at 20M its page-side loop does not finish.
