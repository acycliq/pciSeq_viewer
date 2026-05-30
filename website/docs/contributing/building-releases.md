---
sidebar_position: 2
title: Building & Releases
description: Local development build and the release pipeline.
---

# Building & Releases

## Local development

:::info[TODO]

TODO: document the dev commands from package.json (install, start, build).

:::

```bash
npm install
npm start      # or the project's dev command
```

## Producing installers

The project publishes per-platform installers (`.exe`, `.dmg`, `.AppImage`,
`.deb`) to [GitHub Releases](https://github.com/acycliq/pciSeq_viewer/releases).

:::info[TODO]

TODO: document the electron-builder config and the GitHub Actions workflow under .github/workflows/ that produces the release artifacts.

:::
