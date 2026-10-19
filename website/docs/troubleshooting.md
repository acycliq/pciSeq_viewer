---
title: Troubleshooting
description: Common problems during installation and when loading data.
---

# Troubleshooting

## Gatekeeper on macOS

The macOS build is not signed, so the first launch is blocked. Right-click the app icon,
choose **Open** and confirm. This is required only once.

## AppImage on Linux

On older distributions, an AppImage that does not start is usually caused by the glibc version. Ensure that the file is
executable; if the application still does not start, install the `.deb` package instead.

```bash
chmod +x pciSeq_viewer-x.x.x.AppImage
./pciSeq_viewer-x.x.x.AppImage
```

## Image size prompt

The data folder contains no `.mbtiles` file, from which the width, height and number of
planes are normally read. Once these values are entered, the spots and cells are drawn
without a background. Alternatively, add the background with `stage_image`; see
[Loading the data](./loading-data#background-image).

## Voxel size prompt

The folder contains no `diagnostics/diagnostics.db`, in which the run records the voxel
size. Enter the microns per pixel along x, y and z, matching the `voxel_size` used to fit
the run; the values are stored for that folder.

## Diagnostics database not connected

Ctrl+Click on a cell or a spot has no effect, the chat reports that no diagnostics are
available, and the single cell window reports *Diagnostics data not loaded*. Verify that
the folder contains `diagnostics/diagnostics.db`, or select a database with
**Diagnostics, Setup**. pciSeq `0.0.65` and earlier neither write the database nor provide
`stage_image`; refit with `0.0.66` or later, from the `dev_3d` branch.

## API key

The chat returns an error referring to the API key: no key is saved for the selected
provider, or the saved key is invalid. Enter a key in the **Connection** tab of the chat
panel and save.

## SQLite module in a source checkout

In a source checkout, no dataset can be loaded and the viewer reports that no background
tiles were found, regardless of the folder contents. The native SQLite module has not been
rebuilt for Electron. `npm install` performs this step through its `postinstall` script;
if that step was skipped or failed, run it manually:

```bash
npx electron-rebuild -f -w better-sqlite3
```
