---
title: Troubleshooting
description: Common problems during installation and when loading data.
---

# Troubleshooting

## Gatekeeper on macOS

The macOS build is not signed, so the first launch is blocked. Right-click the app icon,
choose **Open** and confirm. This is required only once.

## AppImage on Linux

Ensure that the file is executable:

```bash
chmod +x pciSeq_viewer-x.x.x.AppImage
./pciSeq_viewer-x.x.x.AppImage
```

On Ubuntu 24.04 and later the AppImage exits immediately with a message that the SUID
sandbox helper is not configured correctly. Ubuntu restricts unprivileged user namespaces,
which the sandbox requires, and an AppImage cannot carry the setuid helper that would
otherwise be used. Install the `.deb` package instead, which configures the helper at
installation. On older distributions, an AppImage that does not start is usually caused by
the glibc version; the `.deb` package is again the remedy.

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

## Sandbox on Ubuntu in a source checkout

On Ubuntu 24.04 and later, `npm start` exits with a message that the SUID sandbox helper
is not configured correctly. The Electron binary under `node_modules` is denied the
unprivileged user namespace that its sandbox requires. Grant it with an AppArmor profile,
replacing the path with that of the checkout:

```bash
sudo tee /etc/apparmor.d/pciseq-viewer-electron > /dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>
profile pciseq-viewer-electron /path/to/pciSeq_viewer/node_modules/electron/dist/electron flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/pciseq-viewer-electron
```

The profile matches on the path and therefore survives `npm install`; a checkout at
another path requires its own profile.
