---
title: Installation
description: Installers for Windows, macOS and Linux, installation from source, and command-line use.
---

# Installation

Installers for the three platforms are available on the
[releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest). Each release
provides an installer and a portable build that runs without installation.

| Platform | Installer | Portable |
| --- | --- | --- |
| Windows | `pciSeq_viewer-Setup-x.x.x.exe` | `pciSeq_viewer-x.x.x.exe` |
| macOS | `pciSeq_viewer-x.x.x.dmg`, drag the app to Applications | `pciSeq_viewer-x.x.x-mac.zip` |
| Linux | `pciSeq_viewer_x.x.x_amd64.deb` | `pciSeq_viewer-x.x.x.AppImage` |

On Linux:

```bash
sudo apt install ./pciSeq_viewer_x.x.x_amd64.deb       # Debian package

chmod +x pciSeq_viewer-x.x.x.AppImage                   # or the AppImage
./pciSeq_viewer-x.x.x.AppImage
```

::: warning First launch on macOS
The macOS build is not signed, so the first launch is blocked. Right-click the app,
choose **Open** and confirm. This is required only once.
:::

**Help, Check for Updates** compares the installed version with the latest release.

## From source

The viewer is an Electron application and requires Node 20 or later.

```bash
git clone https://github.com/acycliq/pciSeq_viewer.git
cd pciSeq_viewer
npm install
npm start
```

[Building and releases](./contributing/building-releases) describes how the installers
are built.

## Command line

The viewer opens on a welcome screen that prompts for the data folder. Alternatively, the
folder can be passed on the command line, in which case the data is loaded directly:

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

`pciSeq_viewer` denotes the installed executable, whose location depends on the platform.
From a source checkout, the equivalent command is
`npm start -- --data=/path/to/viewer_data`.
