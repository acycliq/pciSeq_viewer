---
title: Installation
description: Installers for Windows, macOS and Linux, running from source, and the command line.
---

# Installation

Installers for the three platforms are on the
[releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest). Each release
has an installer and a portable build that runs without installing.

| Platform | Installer | Portable |
| --- | --- | --- |
| Windows | `pciSeq_viewer-Setup-x.x.x.exe` | `pciSeq_viewer-x.x.x.exe` |
| macOS | `pciSeq_viewer-x.x.x.dmg`, drag the app to Applications | `pciSeq_viewer-x.x.x-mac.zip` |
| Linux | `pciSeq_viewer_x.x.x_amd64.deb` | `pciSeq_viewer-x.x.x.AppImage` |

On Linux:

```bash
sudo apt install ./pciSeq_viewer_x.x.x_amd64.deb       # the package

chmod +x pciSeq_viewer-x.x.x.AppImage                   # or the AppImage
./pciSeq_viewer-x.x.x.AppImage
```

::: warning First launch on macOS
The macOS build is not signed, so the first launch is blocked. Right-click the app and
choose **Open**, then confirm. This is needed once.
:::

**Help, Check for Updates** in the menu compares the running version with the latest
release.

## From source

The viewer is an Electron application. Node 20 or newer.

```bash
git clone https://github.com/acycliq/pciSeq_viewer.git
cd pciSeq_viewer
npm install
npm start
```

[Building and releases](./contributing/building-releases) covers the installers.

## Command line

The viewer starts on a welcome screen that asks for the data folder. The folder can be
given on the command line instead, and the run opens straight away:

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

`pciSeq_viewer` stands for the installed executable, whose location depends on the
platform. From a source checkout the command is
`npm start -- --data=/path/to/viewer_data`.
