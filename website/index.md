---
# The site's root sends the reader straight to the docs Overview, the same as the
# pciSeq site, whose root is its introduction. The README is the front page; a
# landing page here only repeated it. The meta refresh covers a browser without
# script, the script below does it without a flash of this page.
layout: page
title: pciSeq Viewer
sidebar: false
head:
  - - meta
    - http-equiv: refresh
      content: 0; url=/pciSeq_viewer/docs/
  - - link
    - rel: canonical
      href: https://acycliq.github.io/pciSeq_viewer/docs/
---

<script setup>
import { onMounted } from 'vue'
import { withBase } from 'vitepress'
onMounted(() => window.location.replace(withBase('/docs/')))
</script>

[pciSeq Viewer documentation](./docs/)
