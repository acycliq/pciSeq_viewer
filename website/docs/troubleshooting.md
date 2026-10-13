---
title: Troubleshooting
description: The things that go wrong at installation and when a run is opened.
---

# Troubleshooting

## Gatekeeper on macOS

The macOS build is not signed, so the first launch is blocked. Right-click the app
icon, choose **Open**, then confirm. This is needed once.

## AppImage on Linux

On an older distribution it is usually the glibc version. Make sure the file is
executable, and if it still does not start install the `.deb` package instead.

```bash
chmod +x pciSeq_viewer-x.x.x.AppImage
./pciSeq_viewer-x.x.x.AppImage
```

## Image size prompt

There is no `.mbtiles` file in the data folder, which is where the width, the height
and the number of planes come from. Enter them and the spots and the cells are drawn
without a background, or add the background with `stage_image`, see
[Loading the data](./loading-data#background-image).

## Voxel size prompt

There is no `diagnostics/diagnostics.db` in the folder, which is where the run records
it. Enter the microns per pixel in x, y and z, the `voxel_size` the run was fitted
with; they are remembered for that folder.

## Diagnostics database not connected

The diagnostics database is not connected. Check that the folder holds
`diagnostics/diagnostics.db`, or point at one with **Diagnostics, Setup**. A run from
pciSeq `0.0.65` or older has no database and no `stage_image`; refit with `0.0.66` or
newer, the `dev_3d` branch.

## API key

No key is saved for the chosen provider, or the saved one is not valid. Paste a key on
the **Connection** tab of the chat panel and save, or set `ANTHROPIC_API_KEY` or
`ZAI_API_KEY` in the environment the viewer starts from.

## SQLite module in a source checkout

After `npm install` the native SQLite module has to be rebuilt for Electron, otherwise
every database open fails and the viewer reports that no background tiles were found:

```bash
npx electron-rebuild -f -w better-sqlite3
```
