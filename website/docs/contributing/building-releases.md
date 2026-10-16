---
title: Building and releases
description: Local development build and the release pipeline.
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

This launches the Electron app with the renderer process linked to `index.html`. The
Chrome DevTools (`Ctrl+Shift+I`) debug the renderer.

`npm install` rebuilds the native SQLite module for Electron in its `postinstall` step.
If that step was skipped, no database opens and the viewer reports missing background
tiles; run it by hand:

```bash
npx electron-rebuild -f -w better-sqlite3
```

## Producing installers

**electron-builder** packages the application for Windows, macOS and Linux.

### Local builds

Installers can be built locally with each platform's toolchain, Xcode for macOS and NSIS for Windows for example:

```bash
# Build for one platform
npm run build:linux
npm run build:mac
npm run build:win

# Build all three at once
npm run build:all
```

There are also finer-grained scripts for specific formats, for example `npm run build:linux:deb`, `npm run build:linux:appimage`, `npm run build:mac:dmg`, `npm run build:mac:portable`, `npm run build:win:nsis`, and `npm run build:win:portable`.

The output artifacts are placed in the `dist/` folder.

### Releasing through GitHub Actions

Installers are built and published by GitHub Actions, but the workflow is triggered **manually**, not by pushing a tag. Open the Actions tab, pick the "Build and Release" workflow, and run it with the tag (`v0.0.6-alpha.1` for example) and the pre-release flag as inputs.

- **Workflow:** `.github/workflows/build-release.yml`
- **Platforms:** Windows (NSIS `.exe`), macOS (DMG, ZIP), Linux (AppImage, DEB).
- **Release:** the workflow attaches the artifacts to a GitHub release, marked as a pre-release when that input is set.

The macOS build is **not** code-signed. The workflow sets `CSC_IDENTITY_AUTO_DISCOVERY: false`, so there are no signing certificates or secrets involved, which is why users get the Gatekeeper warning on first launch (see [Troubleshooting](../troubleshooting#gatekeeper-on-macos)).
