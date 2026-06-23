---
title: Getting Started
description: Install pciSeq Viewer on Windows, macOS, or Linux.
---

# pciSeq Viewer

An interactive desktop application for visualizing 3D spatial
transcriptomics data from [pciSeq](https://github.com/acycliq/pciSeq).

![pciSeq Viewer demo](/img/demo.gif)

::: tip Existing pciSeq results

If cell typing was run with **pciSeq `0.0.65`**, the Arrow files are already
compatible with the viewer, and you can proceed to
[Step 2: Create Background Tiles](/docs/preparing-data#step-2-create-background-tiles).
A newer pciSeq is still required for `stage_image()`.

:::

## Install

Download the latest installer from
**[GitHub Releases](https://github.com/acycliq/pciSeq_viewer/releases/latest)**,
then follow the steps for your platform.

### Windows

- **Installer:** `pciSeq_viewer-Setup-x.x.x.exe`, run it and follow the prompts.
- **Portable:** `pciSeq_viewer-x.x.x.exe`, no installation, just run the .exe.

### macOS

- **Installer:** `pciSeq_viewer-x.x.x.dmg`, drag the app to Applications.
- **Portable:** `pciSeq_viewer-x.x.x-mac.zip`, extract and run.

::: warning First launch on macOS

macOS may show a security warning the first time. Right-click the app and
choose **Open** to bypass Gatekeeper. See
[Troubleshooting](/docs/troubleshooting#macos-app-wont-open) if it still won't open.

:::

### Linux (Ubuntu / Debian)

- **Installer (.deb):**

  ```bash
  sudo apt install ./pciSeq_viewer_x.x.x_amd64.deb
  ```

- **Portable (AppImage):**

  ```bash
  chmod +x pciSeq_viewer-x.x.x.AppImage
  ./pciSeq_viewer-x.x.x.AppImage
  ```

## Next steps

1. [Prepare your data](/docs/preparing-data) with the pciSeq Python package.
2. [Load it into the viewer](/docs/loading-data).
3. [Explore](/docs/using-the-viewer/overview) cells, genes, and boundaries in 3D.
