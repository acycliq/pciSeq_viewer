<script setup>
// The green "work in progress" bar that sits above the navbar, same as the old
// Docusaurus announcementBar. VitePress offsets the nav and content by
// --vp-layout-top-height, so we set that to the bar height while it is showing
// and back to 0 once it is dismissed. The dismissal is remembered per browser.
import { ref, onMounted } from 'vue'

const KEY = 'pciseq-viewer-wip-banner-dismissed'
const visible = ref(false)

function setTop(px) {
  document.documentElement.style.setProperty('--vp-layout-top-height', `${px}px`)
}

onMounted(() => {
  visible.value = localStorage.getItem(KEY) !== '1'
  setTop(visible.value ? 36 : 0)
})

function close() {
  visible.value = false
  localStorage.setItem(KEY, '1')
  setTop(0)
}
</script>

<template>
  <div v-if="visible" class="wip-banner">
    <span>Work in progress: these docs are still being written.</span>
    <button class="wip-close" aria-label="Dismiss" @click="close">&times;</button>
  </div>
</template>

<style>
.wip-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  z-index: calc(var(--vp-z-index-nav) + 1);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2.5rem;
  background: #10b981;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 500;
}

.wip-close {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.9;
}

.wip-close:hover {
  opacity: 1;
}
</style>
