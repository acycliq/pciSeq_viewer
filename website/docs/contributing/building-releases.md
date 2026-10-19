---
title: Building and releases
description: The local development build and the release pipeline.
---

# Building and releases

## Local development

The viewer is an Electron application. To run it locally:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the app in development mode:**
   ```bash
   npm start
   ```

This launches the Electron application with the renderer process loading `index.html`.
The renderer is debugged with Chrome DevTools (`Ctrl+Shift+I`).

`npm install` rebuilds the native SQLite module for Electron in its `postinstall` step.
If that step was skipped, no database can be opened and the viewer reports missing
background tiles; in that case, run it manually:

```bash
npx electron-rebuild -f -w better-sqlite3
```

## Producing installers

**electron-builder** packages the application for Windows, macOS and Linux.

### Local builds

Installers can be built locally with the toolchain of each platform, for example Xcode for macOS and NSIS for Windows:

```bash
# Build for one platform
npm run build:linux
npm run build:mac
npm run build:win

# Build all three at once
npm run build:all
```

Scripts for individual formats are also available: `npm run build:linux:deb`, `npm run build:linux:appimage`, `npm run build:mac:dmg`, `npm run build:mac:portable`, `npm run build:win:nsis` and `npm run build:win:portable`.

The build artefacts are written to `dist/`.

### Releasing through GitHub Actions

Installers are built and published by GitHub Actions. The workflow is triggered **manually**, not by pushing a tag: in the Actions tab, select the "Build and Release" workflow and run it with an existing tag (for example `v0.0.6-alpha.1`) and the pre-release flag as inputs.

- **Workflow:** `.github/workflows/build-release.yml`
- **Platforms:** Windows (NSIS and portable `.exe`), macOS (DMG, ZIP), Linux (AppImage, DEB).
- **Release:** the workflow attaches the artefacts to a GitHub release, marked as a pre-release when that input is set.

The macOS build is **not** code-signed. The workflow sets `CSC_IDENTITY_AUTO_DISCOVERY: false`, so no signing certificates or secrets are involved; as a result, users receive the Gatekeeper warning on first launch (see [Troubleshooting](../troubleshooting#gatekeeper-on-macos)).
